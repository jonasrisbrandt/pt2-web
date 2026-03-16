/*
** PT2 web PowerPacker support uses a local adaptation of libxmp's PP20 depacker.
**
** Source basis:
**   libxmp - The Extended Module Player
**   https://github.com/libxmp/libxmp
**
** Original depacker credits preserved from libxmp:
**   PowerPacker decrunch
**   Based on code by Stuart Caie <kyzer@4u.net>
**   This software is in the Public Domain
**
**   Code from Heikki Orsila's amigadepack 0.02 to replace previous
**   PowerPack depacker with license issues.
**
**   Modified for xmp by Claudio Matsuoka, 08/2007
**   - merged mld's checks from the old depack sources
**   - corrupt file and data detection
**   - implemented "efficiency" checks
**   - further detection based on code by Georg Hoermann
**
**   Modified for xmp by Claudio Matsuoka, 05/2013
**   - decryption code removed
**
** This file adapts the PP20 depacker to pt2-web's FILE*-based loader and
** exposes a buffer-first seam for a future in-repo PP20 packer.
*/

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

#define PP_READ_BITS(nbits, var) \
	bitCnt = (nbits); \
	while (bitsLeft < bitCnt) \
	{ \
		if (bufSrc < src) \
			return false; \
		bitBuffer |= ((uint32_t)(*--bufSrc) << bitsLeft); \
		bitsLeft += 8; \
	} \
	(var) = 0; \
	bitsLeft -= bitCnt; \
	while (bitCnt--) \
	{ \
		(var) = ((var) << 1) | (bitBuffer & 1); \
		bitBuffer >>= 1; \
	}

#define PP_WRITE_BYTE(byte) \
	do \
	{ \
		if (out <= dest) \
			return false; \
		*--out = (byte); \
		written++; \
	} while (0)

static uint32_t ppReadMem24b(const uint8_t *src)
{
	return ((uint32_t)src[0] << 16) | ((uint32_t)src[1] << 8) | src[2];
}

static bool ppDecrunch(const uint8_t *src, uint8_t *dest, const uint8_t *offsetLens, uint32_t srcLen, uint32_t destLen, uint8_t skipBits)
{
	uint8_t bitCnt;
	uint32_t x, todo, offset, offBits, written;

	if (src == NULL || dest == NULL || offsetLens == NULL || skipBits > 32)
		return false;

	uint8_t bitsLeft = 0;
	uint32_t bitBuffer = 0;
	written = 0;

	const uint8_t *bufSrc = src + srcLen;
	uint8_t *out = dest + destLen;
	uint8_t *destEnd = out;

	PP_READ_BITS(skipBits, x);
	while (written < destLen)
	{
		PP_READ_BITS(1, x);
		if (x == 0)
		{
			todo = 1;
			do
			{
				PP_READ_BITS(2, x);
				todo += x;
			}
			while (x == 3);

			while (todo--)
			{
				PP_READ_BITS(8, x);
				PP_WRITE_BYTE((uint8_t)x);
			}

			if (written == destLen)
				break;
		}

		PP_READ_BITS(2, x);
		offBits = offsetLens[x];
		todo = x+2;

		if (x == 3)
		{
			PP_READ_BITS(1, x);
			if (x == 0)
				offBits = 7;

			PP_READ_BITS((uint8_t)offBits, offset);
			do
			{
				PP_READ_BITS(3, x);
				todo += x;
			}
			while (x == 7);
		}
		else
		{
			PP_READ_BITS((uint8_t)offBits, offset);
		}

		if ((out + offset) >= destEnd)
			return false;

		while (todo--)
		{
			x = out[offset];
			PP_WRITE_BYTE((uint8_t)x);
		}
	}

	return true;
}

bool pp20_unpack_buffer(const uint8_t *input, uint32_t inputLen, uint8_t **output, uint32_t *outputLen)
{
	if (output == NULL || outputLen == NULL)
		return false;

	*output = NULL;
	*outputLen = 0;

	if (input == NULL || inputLen < 16)
		return false;

	if (memcmp(input, "PP20", 4) != 0)
		return false;

	/* Amiga longwords are only stored at even addresses. */
	if ((inputLen & 1) != 0)
		return false;

	if (input[4] < 9 || input[5] < 9 || input[6] < 9 || input[7] < 9)
		return false;

	if ((((ppReadMem24b(&input[4]) * 256U) + input[7]) & 0xF0F0F0F0U) != 0)
		return false;

	uint32_t unpackLen = ppReadMem24b(&input[inputLen - 4]);
	if (unpackLen == 0)
		return false;

	uint8_t *buffer = (uint8_t *)malloc(unpackLen);
	if (buffer == NULL)
		return false;

	if (!ppDecrunch(&input[8], buffer, &input[4], inputLen - 12, unpackLen, input[inputLen - 1]))
	{
		free(buffer);
		return false;
	}

	*output = buffer;
	*outputLen = unpackLen;
	return true;
}

bool pp20_pack_buffer(const uint8_t *input, uint32_t inputLen, uint8_t **output, uint32_t *outputLen)
{
	(void)input;
	(void)inputLen;

	if (output != NULL)
		*output = NULL;
	if (outputLen != NULL)
		*outputLen = 0;

	return false;
}

uint8_t *unpackPP(FILE *f, uint32_t *filesize)
{
	if (f == NULL || filesize == NULL)
		return NULL;

	const uint32_t packedLen = *filesize;
	if (packedLen < 16)
	{
		fclose(f);
		return NULL;
	}

	uint8_t *packedData = (uint8_t *)malloc(packedLen);
	if (packedData == NULL)
	{
		fclose(f);
		return NULL;
	}

	rewind(f);
	if (fread(packedData, 1, packedLen, f) != packedLen)
	{
		free(packedData);
		fclose(f);
		return NULL;
	}

	fclose(f);

	uint8_t *output = NULL;
	uint32_t outputLen = 0;
	const bool ok = pp20_unpack_buffer(packedData, packedLen, &output, &outputLen);

	free(packedData);

	if (!ok)
		return NULL;

	*filesize = outputLen;
	return output;
}
