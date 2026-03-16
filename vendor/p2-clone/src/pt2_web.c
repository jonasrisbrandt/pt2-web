#include <ctype.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#ifdef _WIN32
#include <direct.h>
#else
#include <unistd.h>
#endif
#include "pt2_config.h"
#include "pt2_diskop.h"
#include "pt2_audio.h"
#include "pt2_helpers.h"
#include "pt2_keyboard.h"
#include "pt2_module_loader.h"
#include "pt2_module_saver.h"
#include "pt2_mouse.h"
#include "pt2_replayer.h"
#include "pt2_scopes.h"
#include "pt2_sample_loader.h"
#include "pt2_sample_saver.h"
#include "pt2_sampler.h"
#include "pt2_structs.h"
#include "pt2_tables.h"
#include "pt2_textedit.h"
#include "pt2_unicode.h"
#include "pt2_visuals.h"
#include "pt2_visuals_sync.h"
#include "pt2_web.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

EM_JS(void, pt2web_emit_file_export, (const char *filename, const char *mimeType, const uint8_t *data, int32_t length), {
	const name = UTF8ToString(filename);
	const mime = UTF8ToString(mimeType);
	const bytes = HEAPU8.slice(data, data + length);

	window.dispatchEvent(new CustomEvent('pt2web:file-exported', {
		detail: {
			bytes,
			filename: name,
			mimeType: mime
		}
	}));
});
#endif

enum
{
	PT2_WEB_CURSOR_NOTE = 0,
	PT2_WEB_CURSOR_SAMPLE_HIGH = 1,
	PT2_WEB_CURSOR_SAMPLE_LOW = 2,
	PT2_WEB_CURSOR_EFFECT = 3,
	PT2_WEB_CURSOR_PARAM_HIGH = 4,
	PT2_WEB_CURSOR_PARAM_LOW = 5
};

enum
{
	PT2_WEB_MOUSE_BUTTON_LEFT = 0,
	PT2_WEB_MOUSE_BUTTON_MIDDLE = 1,
	PT2_WEB_MOUSE_BUTTON_RIGHT = 2
};

static char snapshotJSON[131072];
static char scopeJSON[16384];
static int8_t scopeBuffer[(PAULA_VOICES * (2 + 64))];
static char moduleExportPath[PATH_MAX + 1];
static char sampleExportPath[PATH_MAX + 1];
static char recentModuleName[PATH_MAX + 1];
static int32_t pt2webAudioMode = 0;
static uint32_t pt2webNextSampleDataRevision = 1;
static uint32_t pt2webSampleDataRevisions[MOD_SAMPLES];

typedef struct pt2webLiveState_t
{
	uint32_t version;
	uint32_t flags;
	int32_t audioMode;
	int32_t mutedMask;
	int32_t bpm;
	int32_t speed;
	int32_t elapsedSeconds;
	int32_t row;
	int32_t pattern;
	int32_t position;
} pt2webLiveState_t;

static pt2webLiveState_t pt2webLiveStateBuffer;

#define PT2_WEB_SAMPLE_PREVIEW_POINTS 256

enum
{
	PT2_WEB_LIVE_FLAG_PLAYING = 1 << 0,
	PT2_WEB_LIVE_FLAG_PATTERN_MODE = 1 << 1
};

enum
{
	PT2_WEB_AUDIO_MODE_CUSTOM = 0,
	PT2_WEB_AUDIO_MODE_MONO = 1,
	PT2_WEB_AUDIO_MODE_AMIGA = 2
};

static const char *pt2webAudioModeName(void)
{
	if (pt2webAudioMode == PT2_WEB_AUDIO_MODE_MONO)
		return "mono";

	if (pt2webAudioMode == PT2_WEB_AUDIO_MODE_AMIGA)
		return "amiga";

	return "custom";
}

static void pt2webApplyAudioMode(void)
{
	if (pt2webAudioMode == PT2_WEB_AUDIO_MODE_MONO)
		audioSetStereoSeparation(0);
	else if (pt2webAudioMode == PT2_WEB_AUDIO_MODE_AMIGA)
		audioSetStereoSeparation(100);
	else
		audioSetStereoSeparation(config.stereoSeparation);
}

static int8_t clampInt8(int32_t value, int32_t low, int32_t high)
{
	if (value < low)
		value = low;
	else if (value > high)
		value = high;

	return (int8_t)value;
}

static uint32_t pt2webAllocateSampleDataRevision(void)
{
	pt2webNextSampleDataRevision++;
	if (pt2webNextSampleDataRevision == 0)
		pt2webNextSampleDataRevision = 1;

	return pt2webNextSampleDataRevision;
}

static void pt2webMarkSampleDataDirty(int32_t sample)
{
	if (sample < 0 || sample >= MOD_SAMPLES)
		return;

	pt2webSampleDataRevisions[sample] = pt2webAllocateSampleDataRevision();
}

static void pt2webMarkAllSampleDataDirty(void)
{
	for (int32_t i = 0; i < MOD_SAMPLES; i++)
		pt2webMarkSampleDataDirty(i);
}

static const pt2webLiveState_t *pt2webUpdateLiveStateBuffer(void)
{
	pt2webLiveState_t nextState;
	memset(&nextState, 0, sizeof (nextState));

	nextState.version = pt2webLiveStateBuffer.version;
	if (song != NULL)
	{
		if (editor.songPlaying)
			nextState.flags |= PT2_WEB_LIVE_FLAG_PLAYING;
		if (editor.playMode == PLAY_MODE_PATTERN)
			nextState.flags |= PT2_WEB_LIVE_FLAG_PATTERN_MODE;
		nextState.audioMode = pt2webAudioMode;

		for (int32_t channel = 0; channel < PAULA_VOICES; channel++)
		{
			if (editor.muted[channel])
				nextState.mutedMask |= 1 << channel;
		}

		nextState.bpm = song->currBPM;
		nextState.speed = song->currSpeed;
		nextState.elapsedSeconds = (int32_t)editor.playbackSeconds;
		nextState.row = song->currRow;
		nextState.pattern = song->currPattern;
		nextState.position = song->currPos;
	}

	if (memcmp(
		((uint8_t *)&nextState) + sizeof (nextState.version),
		((const uint8_t *)&pt2webLiveStateBuffer) + sizeof (pt2webLiveStateBuffer.version),
		sizeof (nextState) - sizeof (nextState.version)) != 0)
	{
		nextState.version = pt2webLiveStateBuffer.version + 1;
		if (nextState.version == 0)
			nextState.version = 1;
	}

	pt2webLiveStateBuffer = nextState;
	return &pt2webLiveStateBuffer;
}

static uint32_t pt2webMouseMaskFromDomButtons(int32_t buttons)
{
	uint32_t mask = 0;

	if (buttons & 1)
		mask |= SDL_BUTTON(SDL_BUTTON_LEFT);

	if (buttons & 2)
		mask |= SDL_BUTTON(SDL_BUTTON_RIGHT);

	if (buttons & 4)
		mask |= SDL_BUTTON(SDL_BUTTON_MIDDLE);

	return mask;
}

static uint8_t pt2webMouseButtonFromDomButton(int32_t button)
{
	switch (button)
	{
		default:
		case PT2_WEB_MOUSE_BUTTON_LEFT: return SDL_BUTTON_LEFT;
		case PT2_WEB_MOUSE_BUTTON_MIDDLE: return SDL_BUTTON_MIDDLE;
		case PT2_WEB_MOUSE_BUTTON_RIGHT: return SDL_BUTTON_RIGHT;
	}
}

static int32_t jsonAppend(char *dst, const size_t dstLen, size_t offset, const char *fmt, ...)
{
	if (dst == NULL || fmt == NULL || offset >= dstLen)
		return (int32_t)offset;

	va_list args;
	va_start(args, fmt);
	const int32_t written = vsnprintf(&dst[offset], dstLen - offset, fmt, args);
	va_end(args);

	if (written < 0)
		return (int32_t)offset;

	offset += (size_t)written;
	if (offset >= dstLen)
		offset = dstLen - 1;

	return (int32_t)offset;
}

static int32_t jsonAppendQuotedString(char *dst, const size_t dstLen, size_t offset, const char *text)
{
	offset = (size_t)jsonAppend(dst, dstLen, offset, "\"");
	if (text != NULL)
	{
		for (const uint8_t *src = (const uint8_t *)text; *src != '\0' && offset < dstLen-1; src++)
		{
			switch (*src)
			{
				case '\\': offset = (size_t)jsonAppend(dst, dstLen, offset, "\\\\"); break;
				case '\"': offset = (size_t)jsonAppend(dst, dstLen, offset, "\\\""); break;
				case '\b': offset = (size_t)jsonAppend(dst, dstLen, offset, "\\b"); break;
				case '\f': offset = (size_t)jsonAppend(dst, dstLen, offset, "\\f"); break;
				case '\n': offset = (size_t)jsonAppend(dst, dstLen, offset, "\\n"); break;
				case '\r': offset = (size_t)jsonAppend(dst, dstLen, offset, "\\r"); break;
				case '\t': offset = (size_t)jsonAppend(dst, dstLen, offset, "\\t"); break;
				default:
				{
					if (*src < 32)
						offset = (size_t)jsonAppend(dst, dstLen, offset, "\\u%04X", *src);
					else
						dst[offset++] = *src;
				}
				break;
			}
		}
	}

	offset = (size_t)jsonAppend(dst, dstLen, offset, "\"");
	return (int32_t)offset;
}

static const char *getBaseName(const char *fullPath)
{
	if (fullPath == NULL)
		return "";

	const char *baseName = strrchr(fullPath, '/');
	const char *winBaseName = strrchr(fullPath, '\\');
	if (baseName == NULL || (winBaseName != NULL && winBaseName > baseName))
		baseName = winBaseName;

	return (baseName != NULL) ? baseName + 1 : fullPath;
}

static void copyRecentModuleName(const char *fullPath)
{
	const char *baseName = getBaseName(fullPath);
	strncpy(recentModuleName, baseName, sizeof (recentModuleName) - 1);
	recentModuleName[sizeof (recentModuleName) - 1] = '\0';
}

static void buildSafeName(char *dst, size_t dstLen, const char *text, const char *fallback, const char *extension)
{
	if (dst == NULL || dstLen == 0)
		return;

	memset(dst, 0, dstLen);

	size_t writePos = 0;
	if (text != NULL)
	{
		for (size_t i = 0; text[i] != '\0' && writePos < dstLen - 1; i++)
		{
			char chr = (char)tolower((uint8_t)text[i]);
			sanitizeFilenameChar(&chr);
			if (chr == '\0')
				break;

			dst[writePos++] = chr;
		}
	}

	if (writePos == 0 && fallback != NULL)
	{
		strncpy(dst, fallback, dstLen - 1);
		dst[dstLen - 1] = '\0';
	}

	if (extension != NULL && dstLen > strlen(dst) + strlen(extension))
		strcat(dst, extension);
}

static void buildPath(char *dst, size_t dstLen, const char *directory, const char *fileName)
{
	if (dst == NULL || dstLen == 0)
		return;

	const char *safeDirectory = (directory != NULL && directory[0] != '\0') ? directory : "/";
	const char *safeFileName = (fileName != NULL && fileName[0] != '\0') ? fileName : "untitled";

	snprintf(dst, dstLen, "%s%s%s",
		safeDirectory,
		(safeDirectory[strlen(safeDirectory) - 1] == '/' || safeDirectory[strlen(safeDirectory) - 1] == '\\') ? "" : "/",
		safeFileName);
}

static const char *cursorFieldName(void)
{
	switch (cursor.mode)
	{
		default:
		case CURSOR_NOTE: return "note";
		case CURSOR_SAMPLE1: return "sampleHigh";
		case CURSOR_SAMPLE2: return "sampleLow";
		case CURSOR_CMD: return "effect";
		case CURSOR_PARAM1: return "paramHigh";
		case CURSOR_PARAM2: return "paramLow";
	}
}

static uint8_t cursorModeFromField(int32_t field)
{
	switch (field)
	{
		default:
		case PT2_WEB_CURSOR_NOTE: return CURSOR_NOTE;
		case PT2_WEB_CURSOR_SAMPLE_HIGH: return CURSOR_SAMPLE1;
		case PT2_WEB_CURSOR_SAMPLE_LOW: return CURSOR_SAMPLE2;
		case PT2_WEB_CURSOR_EFFECT: return CURSOR_CMD;
		case PT2_WEB_CURSOR_PARAM_HIGH: return CURSOR_PARAM1;
		case PT2_WEB_CURSOR_PARAM_LOW: return CURSOR_PARAM2;
	}
}

static int32_t logicalFieldFromCursorMode(uint8_t mode)
{
	switch (mode)
	{
		default:
		case CURSOR_NOTE: return PT2_WEB_CURSOR_NOTE;
		case CURSOR_SAMPLE1: return PT2_WEB_CURSOR_SAMPLE_HIGH;
		case CURSOR_SAMPLE2: return PT2_WEB_CURSOR_SAMPLE_LOW;
		case CURSOR_CMD: return PT2_WEB_CURSOR_EFFECT;
		case CURSOR_PARAM1: return PT2_WEB_CURSOR_PARAM_HIGH;
		case CURSOR_PARAM2: return PT2_WEB_CURSOR_PARAM_LOW;
	}
}

static void setCursorState(int32_t row, int32_t channel, int32_t field)
{
	channel = CLAMP(channel, 0, PAULA_VOICES - 1);
	row = CLAMP(row, 0, MOD_ROWS - 1);

	cursor.channel = (uint8_t)channel;
	cursor.mode = cursorModeFromField(field);
	cursor.pos = (uint8_t)(cursor.channel * 6);

	switch (cursor.mode)
	{
		case CURSOR_SAMPLE1: cursor.pos += 1; break;
		case CURSOR_SAMPLE2: cursor.pos += 2; break;
		case CURSOR_CMD: cursor.pos += 3; break;
		case CURSOR_PARAM1: cursor.pos += 4; break;
		case CURSOR_PARAM2: cursor.pos += 5; break;
		default: break;
	}

	updateCursorPos();
	modSetPos(DONT_SET_ORDER, row);
}

static bool isEditModeEnabled(void)
{
	return editor.currMode == MODE_EDIT || editor.currMode == MODE_RECORD;
}

static void setEditModeEnabled(bool enabled)
{
	if (enabled)
	{
		if (editor.currMode == MODE_PLAY)
			editor.currMode = MODE_RECORD;
		else if (editor.currMode == MODE_IDLE)
			editor.currMode = MODE_EDIT;

		pointerSetMode(POINTER_MODE_EDIT, DO_CARRY);
	}
	else
	{
		if (editor.currMode == MODE_RECORD)
			editor.currMode = MODE_PLAY;
		else
			editor.currMode = MODE_IDLE;

		pointerSetMode((editor.currMode == MODE_PLAY) ? POINTER_MODE_PLAY : POINTER_MODE_IDLE, DO_CARRY);
	}
}

static void adjustSongLength(int32_t delta)
{
	if (song == NULL || (editor.currMode != MODE_IDLE && editor.currMode != MODE_EDIT))
		return;

	int16_t value = song->header.songLength;
	value += (int16_t)delta;
	value = CLAMP(value, 1, 128);
	song->header.songLength = (uint8_t)value;

	if (song->currPos > song->header.songLength - 1)
		modSetPos(song->header.songLength - 1, DONT_SET_ROW);
	else
		editor.currPosEdPattDisp = &song->header.patternTable[song->currPos];

	ui.updateSongLength = true;
}

static int32_t getModuleSizeBytes(void)
{
	if (song == NULL)
		return 0;

	int32_t numPatterns = 0;
	for (int32_t i = 0; i < 128; i++)
	{
		if (song->header.patternTable[i] > numPatterns)
			numPatterns = song->header.patternTable[i];
	}

	numPatterns++;
	if (numPatterns > MAX_PATTERNS)
		numPatterns = MAX_PATTERNS;

	int32_t sampleBytes = 0;
	for (int32_t i = 0; i < MOD_SAMPLES; i++)
		sampleBytes += MAX(0, song->samples[i].length);

	return 1084 + (numPatterns * 1024) + sampleBytes;
}

static int32_t periodToNoteIndex(int32_t period) // 0 = no note, 1 = illegal note, 2..37 = note
{
	if (period == 0)
		return 0;

	int32_t beg = 0;
	int32_t end = 35;
	while (beg <= end)
	{
		const int32_t mid = (beg + end) >> 1;
		const int32_t tableVal = periodTable[mid];
		if (period == tableVal)
			return 2 + mid;

		if (period < tableVal)
			beg = mid + 1;
		else
			end = mid - 1;
	}

	return 1;
}

static const char *noteStringFromPeriod(uint16_t period)
{
	const int32_t index = periodToNoteIndex(period);
	if (index <= 0)
		return NULL;

	return noteNames1[index];
}

static int32_t noteNameToSemitone(const char *note)
{
	if (note == NULL || note[0] == '\0')
		return -1;

	if (!strncmp(note, "C-", 2)) return 0;
	if (!strncmp(note, "C#", 2)) return 1;
	if (!strncmp(note, "D-", 2)) return 2;
	if (!strncmp(note, "D#", 2)) return 3;
	if (!strncmp(note, "E-", 2)) return 4;
	if (!strncmp(note, "F-", 2)) return 5;
	if (!strncmp(note, "F#", 2)) return 6;
	if (!strncmp(note, "G-", 2)) return 7;
	if (!strncmp(note, "G#", 2)) return 8;
	if (!strncmp(note, "A-", 2)) return 9;
	if (!strncmp(note, "A#", 2)) return 10;
	if (!strncmp(note, "B-", 2)) return 11;

	return -1;
}

static uint16_t parseNotePeriod(const char *note)
{
	if (note == NULL || note[0] == '\0')
		return 0;

	if (!strcmp(note, "---"))
		return 0;

	const int32_t semitone = noteNameToSemitone(note);
	if (semitone < 0)
		return 0;

	const char octaveChr = note[2];
	if (octaveChr < '1' || octaveChr > '3')
		return 0;

	const int32_t octave = octaveChr - '1';
	const int32_t tableIndex = (octave * 12) + semitone;
	if (tableIndex < 0 || tableIndex >= 36)
		return 0;

	return (uint16_t)periodTable[tableIndex];
}

static int32_t parseNoteIndex(const char *note)
{
	if (note == NULL || note[0] == '\0' || !strcmp(note, "---"))
		return -1;

	const int32_t semitone = noteNameToSemitone(note);
	if (semitone < 0)
		return -1;

	const char octaveChr = note[2];
	if (octaveChr < '1' || octaveChr > '3')
		return -1;

	const int32_t octave = octaveChr - '1';
	const int32_t noteIndex = (octave * 12) + semitone;
	if (noteIndex < 0 || noteIndex >= 36)
		return -1;

	return noteIndex;
}

static uint8_t parseHexNibble(char chr)
{
	chr = (char)toupper((uint8_t)chr);
	if (chr >= '0' && chr <= '9')
		return (uint8_t)(chr - '0');
	if (chr >= 'A' && chr <= 'F')
		return (uint8_t)(10 + (chr - 'A'));

	return 0;
}

static void normalizeSampleLoop(moduleSample_t *s)
{
	if (s == NULL)
		return;

	s->length = CLAMP(s->length, 0, config.maxSampleLength);
	if (s->length == 0)
	{
		s->loopStart = 0;
		s->loopLength = 2;
		return;
	}

	if (s->loopStart < 0)
		s->loopStart = 0;

	if (s->loopLength < 2)
		s->loopLength = 2;

	if (s->loopStart >= s->length || s->loopStart + s->loopLength > s->length)
	{
		s->loopStart = 0;
		s->loopLength = 2;
	}
}

static int32_t sampleFineTuneSigned(const moduleSample_t *s)
{
	int32_t fineTune = s->fineTune & 0xF;
	if (fineTune > 7)
		fineTune -= 16;

	return fineTune;
}

static void appendPatternCellJSON(char *dst, size_t dstLen, size_t *offset, const note_t *note)
{
	*offset = (size_t)jsonAppend(dst, dstLen, *offset, "{\"note\":");

	const char *noteName = noteStringFromPeriod(note->period);
	if (noteName == NULL)
		*offset = (size_t)jsonAppend(dst, dstLen, *offset, "null");
	else
		*offset = (size_t)jsonAppendQuotedString(dst, dstLen, *offset, noteName);

	if (note->sample == 0)
		*offset = (size_t)jsonAppend(dst, dstLen, *offset, ",\"sample\":null");
	else
		*offset = (size_t)jsonAppend(dst, dstLen, *offset, ",\"sample\":%d", note->sample - 1);

	if (note->command == 0 && note->param == 0)
	{
		*offset = (size_t)jsonAppend(dst, dstLen, *offset, ",\"effect\":null,\"param\":null}");
		return;
	}

	char effect[2];
	char param[3];
	effect[0] = hexTable[note->command & 0xF];
	effect[1] = '\0';
	param[0] = hexTable[(note->param >> 4) & 0xF];
	param[1] = hexTable[note->param & 0xF];
	param[2] = '\0';

	*offset = (size_t)jsonAppend(dst, dstLen, *offset, ",\"effect\":");
	*offset = (size_t)jsonAppendQuotedString(dst, dstLen, *offset, effect);
	*offset = (size_t)jsonAppend(dst, dstLen, *offset, ",\"param\":");
	*offset = (size_t)jsonAppendQuotedString(dst, dstLen, *offset, param);
	*offset = (size_t)jsonAppend(dst, dstLen, *offset, "}");
}

static void appendSamplePreviewJSON(char *dst, size_t dstLen, size_t *offset, const moduleSample_t *s)
{
	*offset = (size_t)jsonAppend(dst, dstLen, *offset, ",\"preview\":[");

	if (song != NULL && s != NULL && s->length > 0 && song->sampleData != NULL)
	{
		const int8_t *sampleData = &song->sampleData[s->offset];

		for (int32_t i = 0; i < PT2_WEB_SAMPLE_PREVIEW_POINTS; i++)
		{
			if (i != 0)
				*offset = (size_t)jsonAppend(dst, dstLen, *offset, ",");

			const int32_t start = (i * s->length) / PT2_WEB_SAMPLE_PREVIEW_POINTS;
			int32_t end = ((i + 1) * s->length) / PT2_WEB_SAMPLE_PREVIEW_POINTS;
			if (end <= start)
				end = start + 1;

			int32_t peak = 0;
			for (int32_t pos = start; pos < end && pos < s->length; pos++)
			{
				const int32_t sample = sampleData[pos];
				if (ABS(sample) >= ABS(peak))
					peak = sample;
			}

			*offset = (size_t)jsonAppend(dst, dstLen, *offset, "%d", peak);
		}
	}
	else
	{
		for (int32_t i = 0; i < PT2_WEB_SAMPLE_PREVIEW_POINTS; i++)
		{
			if (i != 0)
				*offset = (size_t)jsonAppend(dst, dstLen, *offset, ",");

			*offset = (size_t)jsonAppend(dst, dstLen, *offset, "0");
		}
	}

	*offset = (size_t)jsonAppend(dst, dstLen, *offset, "]");
}

static void pt2webRefreshSelectedSample(void)
{
	updateCurrSample();

	if (ui.samplerScreenShown)
		redrawSample();
}

static void pt2webMarkSongModified(void)
{
	song->modified = true;
	updateWindowTitle(MOD_IS_MODIFIED);
}

static void pt2webSetSampleSelection(int32_t start, int32_t end)
{
	if (song == NULL)
		return;

	moduleSample_t *s = &song->samples[editor.currSample];
	if (s->length <= 0 || start < 0 || end < 0)
	{
		editor.markStartOfs = -1;
		editor.markEndOfs = -1;
		editor.samplePos = 0;
		if (ui.samplerScreenShown)
			displaySample();
		return;
	}

	start = CLAMP(start, 0, s->length);
	end = CLAMP(end, 0, s->length);
	if (end < start)
	{
		const int32_t tmp = start;
		start = end;
		end = tmp;
	}

	if (end - start < 1)
	{
		editor.markStartOfs = -1;
		editor.markEndOfs = -1;
		editor.samplePos = start;
	}
	else
	{
		editor.markStartOfs = start;
		editor.markEndOfs = end;
		editor.samplePos = end;
	}

	if (ui.samplerScreenShown)
		displaySample();
}

static void pt2webSampleZoomAround(int32_t anchor, bool zoomOut)
{
	if (song == NULL)
		return;

	moduleSample_t *s = &song->samples[editor.currSample];
	if (s->length <= 0)
		return;

	anchor = CLAMP(anchor, 0, MAX(0, s->length - 1));
	mouse.x = 3 + smpPos2Scr(anchor);
	if (zoomOut)
		samplerZoomOutMouseWheel();
	else
		samplerZoomInMouseWheel();
}

static void pt2webNormalizeLoopForSelection(moduleSample_t *s, int32_t selectionStart, int32_t selectionEnd)
{
	const int32_t oldLoopStart = s->loopStart;
	const int32_t oldLoopEnd = s->loopStart + s->loopLength;
	const int32_t newLength = selectionEnd - selectionStart;

	if (newLength < 2 || oldLoopEnd <= selectionStart || oldLoopStart >= selectionEnd)
	{
		s->loopStart = 0;
		s->loopLength = 2;
		return;
	}

	int32_t newLoopStart = MAX(0, oldLoopStart - selectionStart) & ~1;
	int32_t newLoopEnd = MIN(newLength, oldLoopEnd - selectionStart) & ~1;
	if (newLoopEnd - newLoopStart < 2)
	{
		s->loopStart = 0;
		s->loopLength = 2;
		return;
	}

	s->loopStart = newLoopStart;
	s->loopLength = newLoopEnd - newLoopStart;
}

static void pt2webCropCurrentSample(void)
{
	if (song == NULL)
		return;

	moduleSample_t *s = &song->samples[editor.currSample];
	if (s->length <= 0 || editor.markStartOfs < 0 || editor.markEndOfs <= editor.markStartOfs)
		return;

	int32_t start = CLAMP(editor.markStartOfs, 0, s->length);
	int32_t end = CLAMP(editor.markEndOfs, 0, s->length);
	int32_t newLength = (end - start) & ~1;
	if (newLength < 2)
		return;

	int8_t *sampleData = &song->sampleData[s->offset];
	memmove(sampleData, &sampleData[start], (size_t)newLength);
	if (newLength < config.maxSampleLength)
		memset(&sampleData[newLength], 0, (size_t)(config.maxSampleLength - newLength));

	pt2webNormalizeLoopForSelection(s, start, start + newLength);
	s->length = newLength;
	fixSampleBeep(s);
	normalizeSampleLoop(s);
	updatePaulaLoops();

	sampler.samLength = s->length;
	sampler.samOffset = 0;
	sampler.samDisplay = s->length;
	editor.markStartOfs = -1;
	editor.markEndOfs = -1;
	editor.samplePos = 0;

	pt2webRefreshSelectedSample();
	pt2webMarkSongModified();
}

static void appendScopeChannelJSON(char *dst, size_t dstLen, size_t *offset, int32_t channel)
{
	const scope_t *sc = &scope[channel];
	scope_t state = *sc;

	*offset = (size_t)jsonAppend(dst, dstLen, *offset, "{\"active\":%s,\"volume\":%u,\"sample\":[",
		state.active ? "true" : "false",
		state.volume);

	const int32_t pointCount = 64;
	int32_t pos = state.pos;
	int32_t length = state.length;
	const int8_t *data = state.data;
	const int32_t volume = state.volume;

	for (int32_t i = 0; i < pointCount; i++)
	{
		if (i != 0)
			*offset = (size_t)jsonAppend(dst, dstLen, *offset, ",");

		int32_t sampleValue = 0;
		if (state.active && data != NULL && length > 0 && volume > 0)
		{
			sampleValue = (data[pos] * volume) / 64;

			pos++;
			if (pos >= length)
			{
				pos = 0;
				length = state.newLength;
				data = state.newData;
			}
		}

		*offset = (size_t)jsonAppend(dst, dstLen, *offset, "%d", sampleValue);
	}

	*offset = (size_t)jsonAppend(dst, dstLen, *offset, "]}");
}

void pt2_web_export_file(const char *filename, const char *mimeType)
{
#ifdef __EMSCRIPTEN__
	if (filename == NULL || mimeType == NULL)
		return;

	FILE *f = fopen(filename, "rb");
	if (f == NULL)
		return;

	fseek(f, 0, SEEK_END);
	const long fileSize = ftell(f);
	rewind(f);

	if (fileSize <= 0)
	{
		fclose(f);
		return;
	}

	uint8_t *buffer = (uint8_t *)malloc((size_t)fileSize);
	if (buffer == NULL)
	{
		fclose(f);
		return;
	}

	if (fread(buffer, 1, (size_t)fileSize, f) == (size_t)fileSize)
		pt2web_emit_file_export(filename, mimeType, buffer, (int32_t)fileSize);

	free(buffer);
	fclose(f);
#else
	(void)filename;
	(void)mimeType;
#endif
}

int32_t pt2_web_load_file_from_path(const char *fullPath, int32_t autoPlay)
{
	if (fullPath == NULL)
		return false;

	loadDroppedFile((char *)(uintptr_t)fullPath, (uint32_t)strlen(fullPath), autoPlay != 0, true);
	return true;
}

int32_t pt2_web_engine_boot(void)
{
	pt2webAudioMode = PT2_WEB_AUDIO_MODE_CUSTOM;
	pt2webApplyAudioMode();
	pt2webMarkAllSampleDataDirty();
	memset(&pt2webLiveStateBuffer, 0, sizeof (pt2webLiveStateBuffer));
	return song != NULL;
}

int32_t pt2_web_engine_load_module(const char *fullPath)
{
	if (fullPath == NULL || fullPath[0] == '\0')
		return false;

	copyRecentModuleName(fullPath);
	const bool loaded = pt2_web_load_file_from_path(fullPath, false);
	if (loaded)
		pt2webMarkAllSampleDataDirty();

	return loaded;
}

const char *pt2_web_engine_save_module(const char *directory)
{
	if (song == NULL)
		return NULL;

	char fileName[64];
	buildSafeName(fileName, sizeof (fileName), song->header.name, "untitled", ".mod");
	buildPath(moduleExportPath, sizeof (moduleExportPath), directory, fileName);

	if (!modSave(moduleExportPath))
		return NULL;

	return moduleExportPath;
}

int32_t pt2_web_engine_load_sample(const char *fullPath)
{
	if (song == NULL || fullPath == NULL || fullPath[0] == '\0')
		return false;

	const bool loaded = loadSample((UNICHAR *)(uintptr_t)fullPath, (char *)(uintptr_t)getBaseName(fullPath));
	if (loaded)
		pt2webMarkSampleDataDirty(editor.currSample);

	return loaded;
}

const char *pt2_web_engine_save_sample(int32_t slot, const char *format, const char *directory)
{
	if (song == NULL || directory == NULL || directory[0] == '\0')
		return NULL;

	const int8_t previousSample = editor.currSample;
	editor.currSample = clampInt8(slot, 0, MOD_SAMPLES - 1);
	editor.sampleZero = false;

	if (format == NULL || !_stricmp(format, "wav"))
		diskop.smpSaveType = DISKOP_SMP_WAV;
	else if (!_stricmp(format, "iff"))
		diskop.smpSaveType = DISKOP_SMP_IFF;
	else
		diskop.smpSaveType = DISKOP_SMP_RAW;

	char fileName[64];
	buildSafeName(fileName, sizeof (fileName), song->samples[editor.currSample].text, "untitled", NULL);
	if (fileName[0] == '\0')
		strcpy(fileName, "untitled");

	size_t extPos = strlen(fileName);
	if (extPos >= 4 && (!_stricmp(&fileName[extPos - 4], ".wav") || !_stricmp(&fileName[extPos - 4], ".iff")))
		fileName[extPos - 4] = '\0';

	addSampleFileExt(fileName);
	buildPath(sampleExportPath, sizeof (sampleExportPath), directory, fileName);

	UNICHAR oldPath[PATH_MAX + 1];
	if (UNICHAR_GETCWD(oldPath, PATH_MAX) == NULL)
		oldPath[0] = '\0';

	if (UNICHAR_CHDIR((UNICHAR *)(uintptr_t)directory) != 0)
	{
		editor.currSample = previousSample;
		updateCurrSample();
		return NULL;
	}

	const bool saved = saveSample(DONT_CHECK_IF_FILE_EXIST, DONT_GIVE_NEW_FILENAME);

	if (oldPath[0] != '\0')
		UNICHAR_CHDIR(oldPath);

	editor.currSample = previousSample;
	updateCurrSample();

	if (!saved)
		return NULL;

	return sampleExportPath;
}

void pt2_web_engine_new_song(void)
{
	if (song == NULL)
		return;

	modStop();
	clearSong();
	clearSamples();
	pt2webMarkAllSampleDataDirty();
	recentModuleName[0] = '\0';
	statusAllRight();
}

void pt2_web_engine_set_title(const char *title)
{
	if (song == NULL)
		return;

	memset(song->header.name, 0, sizeof (song->header.name));
	if (title != NULL)
		strncpy(song->header.name, title, 20);

	song->header.name[20] = '\0';
	song->modified = true;
	ui.updateSongName = true;
	updateWindowTitle(MOD_IS_MODIFIED);
}

void pt2_web_engine_set_bpm(int32_t bpm)
{
	if (song == NULL)
		return;

	modSetTempo(CLAMP(bpm, MIN_BPM, MAX_BPM), true);
	song->modified = true;
	updateWindowTitle(MOD_IS_MODIFIED);
}

void pt2_web_engine_set_speed(int32_t speed)
{
	if (song == NULL)
		return;

	modSetSpeed(CLAMP(speed, 1, 31));
	song->modified = true;
	updateWindowTitle(MOD_IS_MODIFIED);
}

void pt2_web_engine_set_pattern(int32_t pattern)
{
	if (song == NULL)
		return;

	modSetPattern((uint8_t)CLAMP(pattern, 0, MAX_PATTERNS - 1));
}

void pt2_web_engine_set_position(int32_t position)
{
	if (song == NULL)
		return;

	modSetPos((int16_t)CLAMP(position, 0, song->header.songLength - 1), DONT_SET_ROW);
}

void pt2_web_engine_adjust_song_length(int32_t delta)
{
	adjustSongLength(delta);
}

void pt2_web_engine_set_edit_mode(int32_t enabled)
{
	if (song == NULL)
		return;

	setEditModeEnabled(enabled != 0);
}

void pt2_web_engine_toggle_mute_channel(int32_t channel)
{
	if (song == NULL)
		return;

	channel = CLAMP(channel, 0, PAULA_VOICES - 1);
	editor.muted[channel] ^= 1;
}

void pt2_web_engine_set_cursor(int32_t row, int32_t channel, int32_t field)
{
	if (song == NULL)
		return;

	setCursorState(row, channel, field);
}

void pt2_web_engine_move_cursor(int32_t rowDelta, int32_t channelDelta, int32_t fieldDelta)
{
	if (song == NULL)
		return;

	int32_t field = logicalFieldFromCursorMode(cursor.mode);
	if (fieldDelta != 0)
		field = CLAMP(field + fieldDelta, PT2_WEB_CURSOR_NOTE, PT2_WEB_CURSOR_PARAM_LOW);

	setCursorState(song->currRow + rowDelta, cursor.channel + channelDelta, field);
}

void pt2_web_engine_set_cell(int32_t row, int32_t channel, const char *note, int32_t sample, const char *effect, const char *param)
{
	if (song == NULL)
		return;

	row = CLAMP(row, 0, MOD_ROWS - 1);
	channel = CLAMP(channel, 0, PAULA_VOICES - 1);

	note_t *cell = &song->patterns[song->currPattern][(row * PAULA_VOICES) + channel];
	cell->period = parseNotePeriod(note);
	cell->sample = (sample < 0) ? 0 : (uint8_t)(CLAMP(sample, 0, MOD_SAMPLES - 1) + 1);
	cell->command = (effect == NULL || effect[0] == '\0') ? 0 : parseHexNibble(effect[0]);
	cell->param = (param == NULL || param[0] == '\0') ? 0 : (uint8_t)((parseHexNibble(param[0]) << 4) | parseHexNibble(param[1]));

	song->modified = true;
	ui.updatePatternData = true;
	updateWindowTitle(MOD_IS_MODIFIED);
}

void pt2_web_engine_clear_cell(int32_t row, int32_t channel)
{
	if (song == NULL)
		return;

	row = CLAMP(row, 0, MOD_ROWS - 1);
	channel = CLAMP(channel, 0, PAULA_VOICES - 1);

	memset(&song->patterns[song->currPattern][(row * PAULA_VOICES) + channel], 0, sizeof (note_t));
	song->modified = true;
	ui.updatePatternData = true;
	updateWindowTitle(MOD_IS_MODIFIED);
}

void pt2_web_engine_select_sample(int32_t sample)
{
	if (song == NULL)
		return;

	editor.currSample = clampInt8(sample, 0, MOD_SAMPLES - 1);
	editor.sampleZero = false;
	pt2webRefreshSelectedSample();
}

void pt2_web_engine_update_sample(int32_t sample, const char *name, int32_t volume, int32_t fineTune, int32_t length, int32_t loopStart, int32_t loopLength)
{
	if (song == NULL)
		return;

	sample = CLAMP(sample, 0, MOD_SAMPLES - 1);
	moduleSample_t *s = &song->samples[sample];
	const int32_t oldLength = s->length;

	editor.currSample = (int8_t)sample;
	editor.sampleZero = false;

	memset(s->text, 0, sizeof (s->text));
	if (name != NULL)
		strncpy(s->text, name, 22);

	s->volume = clampInt8(volume, 0, 64);
	fineTune = CLAMP(fineTune, -8, 7);
	s->fineTune = (uint8_t)((fineTune < 0) ? (16 + fineTune) : fineTune);
	s->length = CLAMP(length, 0, config.maxSampleLength);
	s->loopStart = MAX(loopStart, 0);
	s->loopLength = MAX(loopLength, 2);
	normalizeSampleLoop(s);
	fixSampleBeep(s);
	updatePaulaLoops();
	pt2webRefreshSelectedSample();
	if (s->length != oldLength)
		pt2webMarkSampleDataDirty(sample);

	pt2webMarkSongModified();
}

void pt2_web_engine_open_sample_editor(int32_t sample)
{
	if (song == NULL)
		return;

	pt2_web_engine_select_sample(sample);
	if (!ui.samplerScreenShown)
		samplerScreen();
	else
		redrawSample();
}

void pt2_web_engine_close_sample_editor(void)
{
	if (song == NULL || !ui.samplerScreenShown)
		return;

	exitFromSam();
}

void pt2_web_engine_sample_show_all(void)
{
	if (song == NULL)
		return;

	samplerShowAll();
}

void pt2_web_engine_sample_show_selection(void)
{
	if (song == NULL)
		return;

	samplerShowRange();
}

void pt2_web_engine_sample_zoom_in(int32_t anchor)
{
	pt2webSampleZoomAround(anchor, false);
}

void pt2_web_engine_sample_zoom_out(int32_t anchor)
{
	pt2webSampleZoomAround(anchor, true);
}

void pt2_web_engine_sample_set_view(int32_t start, int32_t length)
{
	if (song == NULL)
		return;

	moduleSample_t *s = &song->samples[editor.currSample];
	if (s->length <= 0)
		return;

	length = CLAMP(length & ~1, 2, s->length);
	start = CLAMP(start, 0, MAX(0, s->length - length));

	sampler.samOffset = start;
	sampler.samDisplay = length;
	renderSampleData();
	updateSamplePos();
	setLoopSprites();
}

void pt2_web_engine_sample_set_selection(int32_t start, int32_t end)
{
	pt2webSetSampleSelection(start, end);
}

void pt2_web_engine_sample_set_loop(int32_t start, int32_t end)
{
	if (song == NULL)
		return;

	moduleSample_t *s = &song->samples[editor.currSample];
	if (s->length < 2)
		return;

	int32_t loopStart = (start >= 0) ? (start & ~1) : s->loopStart;
	int32_t loopEnd = (end >= 0) ? (end & ~1) : (s->loopStart + s->loopLength);

	loopStart = CLAMP(loopStart, 0, MAX(0, s->length - 2));
	loopEnd = CLAMP(loopEnd, loopStart + 2, s->length);

	s->loopStart = loopStart;
	s->loopLength = MAX(2, loopEnd - loopStart);
	normalizeSampleLoop(s);
	fixSampleBeep(s);
	updatePaulaLoops();
	setLoopSprites();
	pt2webRefreshSelectedSample();
	pt2webMarkSongModified();
}

void pt2_web_engine_sample_toggle_loop(int32_t enabled)
{
	if (song == NULL)
		return;

	moduleSample_t *s = &song->samples[editor.currSample];
	if (s->length < 2)
		return;

	if (enabled == 0)
	{
		s->loopStart = 0;
		s->loopLength = 2;
	}
	else if (s->loopLength <= 2)
	{
		s->loopStart = 0;
		s->loopLength = MAX(2, s->length & ~1);
	}

	normalizeSampleLoop(s);
	fixSampleBeep(s);
	updatePaulaLoops();
	setLoopSprites();
	pt2webRefreshSelectedSample();
	pt2webMarkSongModified();
}

void pt2_web_engine_sample_crop(void)
{
	pt2webCropCurrentSample();
	pt2webMarkSampleDataDirty(editor.currSample);
}

void pt2_web_engine_sample_cut(void)
{
	if (song == NULL)
		return;

	samplerSamDelete(1);
	pt2webRefreshSelectedSample();
	pt2webMarkSampleDataDirty(editor.currSample);
	pt2webMarkSongModified();
}

void pt2_web_engine_sample_play(int32_t mode)
{
	if (song == NULL)
		return;

	switch (mode)
	{
		case 1: samplerPlayDisplay(); break;
		case 2: samplerPlayRange(); break;
		default: samplerPlayWaveform(); break;
	}
}

void pt2_web_engine_cycle_audio_mode(void)
{
	pt2webAudioMode = (pt2webAudioMode + 1) % 3;
	pt2webApplyAudioMode();
}

const uint8_t *pt2_web_engine_live_state_buffer(void)
{
	return (const uint8_t *)pt2webUpdateLiveStateBuffer();
}

int32_t pt2_web_engine_live_state_buffer_length(void)
{
	return (int32_t)sizeof (pt2webLiveStateBuffer);
}

void pt2_web_engine_preview_note(const char *note, int32_t channel)
{
	if (song == NULL || song->sampleData == NULL)
		return;

	const int32_t noteIndex = parseNoteIndex(note);
	if (noteIndex < 0 || noteIndex >= 36)
		return;

	channel = CLAMP(channel, 0, PAULA_VOICES - 1);

	moduleSample_t *s = &song->samples[editor.currSample];
	if (s->length <= 1)
		return;

	moduleChannel_t *ch = &song->channels[channel];
	const int16_t period = periodTable[((s->fineTune & 0xF) * 37) + noteIndex];

	editor.currPlayNote = (int8_t)noteIndex;

	lockAudio();

	ch->n_samplenum = editor.currSample;
	ch->n_volume = s->volume;
	ch->n_period = period;
	ch->n_start = &song->sampleData[s->offset];
	ch->n_length = (uint16_t)((s->loopStart > 0) ? (s->loopStart + s->loopLength) >> 1 : s->length >> 1);
	ch->n_loopstart = &song->sampleData[s->offset + s->loopStart];
	ch->n_replen = (uint16_t)(s->loopLength >> 1);

	if (ch->n_length == 0)
		ch->n_length = 1;

	const uint32_t voiceAddr = 0xDFF0A0 + (channel * 16);
	paulaWriteWord(voiceAddr + 8, ch->n_volume);
	paulaWriteWord(voiceAddr + 6, ch->n_period);
	paulaWritePtr(voiceAddr + 0, ch->n_start);
	paulaWriteWord(voiceAddr + 4, ch->n_length);

	if (!editor.muted[channel])
		paulaWriteWord(0xDFF096, 0x8000 | ch->n_dmabit);
	else
		paulaWriteWord(0xDFF096, ch->n_dmabit);

	paulaWritePtr(voiceAddr + 0, ch->n_loopstart);
	paulaWriteWord(voiceAddr + 4, ch->n_replen);

	setVisualsVolume(channel, ch->n_volume);
	setVisualsPeriod(channel, ch->n_period);
	setVisualsDataPtr(channel, ch->n_start);
	setVisualsLength(channel, ch->n_length);

	if (!editor.muted[channel])
		setVisualsDMACON(0x8000 | ch->n_dmabit);
	else
		setVisualsDMACON(ch->n_dmabit);

	setVisualsDataPtr(channel, ch->n_loopstart);
	setVisualsLength(channel, ch->n_replen);

	unlockAudio();
}

void pt2_web_engine_preview_note_stop(void)
{
	if (song == NULL)
		return;

	modStop();
}

void pt2_web_engine_transport_play_song(void)
{
	if (song == NULL)
		return;

	modPlay(DONT_SET_PATTERN, song->currPos, song->currRow);
}

void pt2_web_engine_transport_play_pattern(void)
{
	if (song == NULL)
		return;

	playPattern(song->currRow);
}

void pt2_web_engine_transport_pause(void)
{
	if (song == NULL)
		return;

	modStop();
}

void pt2_web_engine_transport_stop(void)
{
	if (song == NULL)
		return;

	modStop();
	modSetPos(0, 0);
}

void pt2_web_engine_refresh_layout(void)
{
	updateRenderSizeVars();
	updateMouseScaling();
}

void pt2_web_engine_pointer_move(int32_t x, int32_t y, int32_t buttons)
{
	setInjectedMouseState(x, y, pt2webMouseMaskFromDomButtons(buttons));
	mouse.absX = x;
	mouse.absY = y;
	mouse.rawX = x;
	mouse.rawY = y;
	mouse.x = x;
	mouse.y = y;
	mouse.buttonState = pt2webMouseMaskFromDomButtons(buttons);
	mouse.leftButtonPressed = (buttons & 1) ? true : false;
	mouse.rightButtonPressed = (buttons & 2) ? true : false;
}

void pt2_web_engine_pointer_button(int32_t x, int32_t y, int32_t button, int32_t pressed, int32_t buttons)
{
	setInjectedMouseState(x, y, pt2webMouseMaskFromDomButtons(buttons));
	mouse.absX = x;
	mouse.absY = y;
	mouse.rawX = x;
	mouse.rawY = y;
	mouse.x = x;
	mouse.y = y;
	mouse.buttonState = pt2webMouseMaskFromDomButtons(buttons);

	const uint8_t sdlButton = pt2webMouseButtonFromDomButton(button);
	if (pressed)
		mouseButtonDownHandler(sdlButton);
	else
		mouseButtonUpHandler(sdlButton);

	mouse.leftButtonPressed = (buttons & 1) ? true : false;
	mouse.rightButtonPressed = (buttons & 2) ? true : false;
}

void pt2_web_engine_key_down(int32_t scancode, int32_t keycode, int32_t shift, int32_t ctrl, int32_t alt, int32_t meta)
{
	setInjectedKeyModifiers(ctrl != 0, alt != 0, shift != 0, meta != 0);
	keyDownHandler((SDL_Scancode)scancode, (SDL_Keycode)keycode);
}

void pt2_web_engine_key_up(int32_t scancode, int32_t keycode, int32_t shift, int32_t ctrl, int32_t alt, int32_t meta)
{
	(void)keycode;
	setInjectedKeyModifiers(ctrl != 0, alt != 0, shift != 0, meta != 0);
	keyUpHandler((SDL_Scancode)scancode);
}

void pt2_web_engine_text_input(const char *text)
{
	if (text == NULL || text[0] == '\0' || !ui.editTextFlag)
		return;

	handleTextEditInputChar(text[0]);
}

const int8_t *pt2_web_engine_scope_buffer(void)
{
	for (int32_t i = 0; i < PAULA_VOICES; i++)
	{
		const scope_t *sc = &scope[i];
		scope_t state = *sc;
		int32_t offset = i * (2 + 64);

		scopeBuffer[offset + 0] = state.active ? 1 : 0;
		scopeBuffer[offset + 1] = clampInt8(state.volume, 0, 64);

		int32_t pos = state.pos;
		int32_t length = state.length;
		const int8_t *data = state.data;
		const int32_t volume = state.volume;

		for (int32_t j = 0; j < 64; j++)
		{
			int32_t sampleValue = 0;
			if (state.active && data != NULL && length > 0 && volume > 0)
			{
				sampleValue = (data[pos] * volume) / 64;

				pos++;
				if (pos >= length)
				{
					pos = 0;
					length = state.newLength;
					data = state.newData;
				}
			}

			scopeBuffer[offset + 2 + j] = clampInt8(sampleValue, -128, 127);
		}
	}

	return scopeBuffer;
}

int32_t pt2_web_engine_scope_buffer_length(void)
{
	return (int32_t)(sizeof (scopeBuffer));
}

const int8_t *pt2_web_engine_sample_buffer(int32_t sample)
{
	if (song == NULL || song->sampleData == NULL)
		return NULL;

	sample = CLAMP(sample, 0, MOD_SAMPLES - 1);
	moduleSample_t *s = &song->samples[sample];
	if (s->length <= 0)
		return NULL;

	return &song->sampleData[s->offset];
}

int32_t pt2_web_engine_sample_buffer_length(int32_t sample)
{
	if (song == NULL)
		return 0;

	sample = CLAMP(sample, 0, MOD_SAMPLES - 1);
	return song->samples[sample].length;
}

const char *pt2_web_engine_scope_json(void)
{
	memset(scopeJSON, 0, sizeof (scopeJSON));
	size_t offset = 0;

	offset = (size_t)jsonAppend(scopeJSON, sizeof (scopeJSON), offset, "{\"channels\":[");
	for (int32_t i = 0; i < PAULA_VOICES; i++)
	{
		if (i != 0)
			offset = (size_t)jsonAppend(scopeJSON, sizeof (scopeJSON), offset, ",");

		appendScopeChannelJSON(scopeJSON, sizeof (scopeJSON), &offset, i);
	}

	offset = (size_t)jsonAppend(scopeJSON, sizeof (scopeJSON), offset, "]}");
	scopeJSON[MIN(offset, sizeof (scopeJSON) - 1)] = '\0';

	return scopeJSON;
}

const char *pt2_web_engine_snapshot_json(void)
{
	if (song == NULL)
		return "{}";

	memset(snapshotJSON, 0, sizeof (snapshotJSON));
	size_t offset = 0;

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		"{\"backend\":\"wasm\",\"ready\":true,\"status\":");
	offset = (size_t)jsonAppendQuotedString(snapshotJSON, sizeof (snapshotJSON), offset,
		ui.statusMessage[0] != '\0' ? ui.statusMessage : "READY");

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		",\"diagnostics\":[");
	offset = (size_t)jsonAppendQuotedString(snapshotJSON, sizeof (snapshotJSON), offset,
		"Playback and Paula run in the original PT2 C core. The web edit adapter is still being expanded.");
	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		"],\"debug\":{\"mouse\":{\"absX\":%d,\"absY\":%d,\"rawX\":%d,\"rawY\":%d,\"x\":%d,\"y\":%d,"
		"\"left\":%s,\"right\":%s,\"buttons\":%u},\"video\":{\"renderW\":%d,\"renderH\":%d,\"scaleX\":%.8f,"
		"\"scaleY\":%.8f,\"fullscreen\":%s}},\"capabilities\":{\"accuratePlayback\":true,\"moduleEditing\":true,\"sampleEditing\":true,"
		"\"sampleImport\":true,\"moduleImport\":true,\"keyboardFirst\":true,\"browserPersistence\":true}",
		mouse.absX, mouse.absY, mouse.rawX, mouse.rawY, mouse.x, mouse.y,
		mouse.leftButtonPressed ? "true" : "false",
		mouse.rightButtonPressed ? "true" : "false",
		mouse.buttonState,
		video.renderW, video.renderH, video.dMouseXMul, video.dMouseYMul,
		video.fullscreen ? "true" : "false");

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		",\"audio\":{\"mode\":\"%s\",\"stereo\":%s}",
		pt2webAudioModeName(),
		(pt2webAudioMode == PT2_WEB_AUDIO_MODE_MONO) ? "false" : "true");

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		",\"song\":{\"title\":");
	offset = (size_t)jsonAppendQuotedString(snapshotJSON, sizeof (snapshotJSON), offset, song->header.name);
	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		",\"currentPattern\":%d,\"currentPosition\":%d,\"length\":%d,\"sizeBytes\":%d}",
		song->currPattern, song->currPos, song->header.songLength, getModuleSizeBytes());

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		",\"transport\":{\"playing\":%s,\"mode\":\"%s\",\"bpm\":%d,\"speed\":%d,\"elapsedSeconds\":%u,\"row\":%d,\"pattern\":%d,\"position\":%d}",
		editor.songPlaying ? "true" : "false",
		(editor.playMode == PLAY_MODE_PATTERN) ? "pattern" : "song",
		song->currBPM, song->currSpeed, editor.playbackSeconds, song->currRow, song->currPattern, song->currPos);

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		",\"editor\":{\"editMode\":%s,\"recordMode\":%s,\"muted\":[%s,%s,%s,%s]}",
		isEditModeEnabled() ? "true" : "false",
		(editor.currMode == MODE_RECORD) ? "true" : "false",
		editor.muted[0] ? "true" : "false",
		editor.muted[1] ? "true" : "false",
		editor.muted[2] ? "true" : "false",
		editor.muted[3] ? "true" : "false");

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		",\"cursor\":{\"row\":%d,\"channel\":%d,\"field\":\"%s\"},\"selectedSample\":%d,\"recentModuleName\":",
		song->currRow, cursor.channel, cursorFieldName(), editor.currSample);

	if (recentModuleName[0] == '\0')
		offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, "null");
	else
		offset = (size_t)jsonAppendQuotedString(snapshotJSON, sizeof (snapshotJSON), offset, recentModuleName);

	moduleSample_t *currSample = &song->samples[editor.currSample];
	const int32_t sampleLength = currSample->length;
	const int32_t visibleStart = ui.samplerScreenShown ? sampler.samOffset : 0;
	const int32_t visibleLength = ui.samplerScreenShown ? sampler.samDisplay : sampleLength;
	const int32_t loopEnd = currSample->loopStart + currSample->loopLength;

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		",\"sampleEditor\":{\"open\":%s,\"sample\":%d,\"visibleStart\":%d,\"visibleLength\":%d,"
		"\"selectionStart\":",
		ui.samplerScreenShown ? "true" : "false",
		editor.currSample,
		visibleStart,
		visibleLength);

	if (editor.markStartOfs < 0)
		offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, "null");
	else
		offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, "%d", editor.markStartOfs);

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, ",\"selectionEnd\":");
	if (editor.markStartOfs < 0 || editor.markEndOfs < 0)
		offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, "null");
	else
		offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, "%d", editor.markEndOfs);

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		",\"loopStart\":%d,\"loopEnd\":%d,\"sampleLength\":%d}",
		currSample->loopStart, loopEnd, sampleLength);

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
		",\"pattern\":{\"index\":%d,\"rows\":[", song->currPattern);

	for (int32_t row = 0; row < MOD_ROWS; row++)
	{
		if (row != 0)
			offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, ",");

		offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, "{\"index\":%d,\"channels\":[", row);
		for (int32_t channel = 0; channel < PAULA_VOICES; channel++)
		{
			if (channel != 0)
				offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, ",");

			appendPatternCellJSON(snapshotJSON, sizeof (snapshotJSON), &offset,
				&song->patterns[song->currPattern][(row * PAULA_VOICES) + channel]);
		}

		offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, "]}");
	}

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, "]},\"samples\":[");
	for (int32_t i = 0; i < MOD_SAMPLES; i++)
	{
		if (i != 0)
			offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, ",");

		const moduleSample_t *s = &song->samples[i];
		offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
			"{\"index\":%d,\"name\":", i);
		offset = (size_t)jsonAppendQuotedString(snapshotJSON, sizeof (snapshotJSON), offset, s->text);
		offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset,
			",\"length\":%d,\"volume\":%d,\"fineTune\":%d,\"loopStart\":%d,\"loopLength\":%d,\"dataRevision\":%u",
			s->length, s->volume, sampleFineTuneSigned(s), s->loopStart, s->loopLength, pt2webSampleDataRevisions[i]);
		offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, "}");
	}

	offset = (size_t)jsonAppend(snapshotJSON, sizeof (snapshotJSON), offset, "]}");
	snapshotJSON[MIN(offset, sizeof (snapshotJSON) - 1)] = '\0';

	return snapshotJSON;
}
