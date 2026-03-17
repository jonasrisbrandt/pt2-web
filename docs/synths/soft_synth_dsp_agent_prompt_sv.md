
# Kort agent-prompt: soft synth DSP för C → WASM/Emscripten

Du implementerar en soft synth vars huvudsyfte är att rendera högkvalitativa samples till en retro tracker. Prioritera ljudkvalitet, stabilitet, determinism och underhållbar kod framför smarta men sköra tricks.

## Mål
- Låg aliasing.
- Musikaliskt filterbeteende under modulation.
- Inga klick, plopp, DC-drifter, NaN/Inf eller instabila feedbackloopar.
- Deterministisk rendering med seedad RNG.
- Kod i C som fungerar bra i WASM/Emscripten.

## Icke-förhandlingsbara regler
- Inga heap-allokeringar i audio/process-funktioner.
- Inga lås, sleep, fil-I/O eller logging i audio/process-funktioner.
- All state ska vara explicit och initierad.
- Alla tidsvarierande parametrar ska smoothas eller processas sample-accurate.
- Oversampla bara de block som behöver det, särskilt nonlineariteter.
- Export till lägre bitdjup ska ditheras exakt en gång sist i kedjan.

## Rekommenderad baseline-arkitektur
Bygg tre lager:
1. event/parameterlager,
2. voice/DSP-lager,
3. render/exportlager.

Typisk röstkedja:
`oscillatorbank -> mixer -> pre-filter drive -> filter -> post-filter drive -> amp env -> voice out`

Global kedja:
`sum voices -> chorus/delay/reverb -> output trim -> exporter`

Gör skillnad mellan preview/realtime och offline/final render. Offline får vara dyrare och renare.

## Oscillatorpolicy
### Sinus
Använd `sinf` eller interpolerad wavetable. Båda är godtagbara.

### Såg/puls/triangel
Använd inte naiva vågformer i produktion. Default ska vara:
- saw/pulse: PolyBLEP
- triangle: integrerad bandbegränsad square

PWM ska bandbegränsa båda kanterna och pulse width ska clampas till rimligt intervall.

### Hard sync
Naiv hard sync är inte tillåten. Använd MinBLEP/BLEP-liknande edge-korrigering eller annan bandbegränsad lösning.

### Wavetable
För komplexa periodiska vågformer: använd flera bandbegränsade tabeller (mipmap/multitable). Välj tabell efter tonhöjd och crossfada helst mellan tabeller.

### Noise
Använd reproducerbar seedad RNG, inte plattformsberoende `rand()`.

### FM/PM
Starta med sinusbaserad FM/PM. Om aliasing blir tydlig: använd lokal oversampling eller begränsa index i preview-läge. Feedback-FM kräver extra försiktighet.

## Filterpolicy
### Huvudfilter
Default ska vara TPT/ZDF-baserat state variable filter (SVF). Det ska ge LP/BP/HP och tåla modulering av cutoff/Q bättre än enklare koefficientbyten.

### Biquads
Använd biquads för EQ och utility-filter, inte som huvudkaraktärsfilter om synthkänsla och tung modulation är viktiga.

### Ladder
Implementera ladderfilter som separat färg-/karaktärsfilter. Om ni använder icke-linjär laddermodell måste den normalt få lokal oversampling och noggrann tuning av cutoff/resonans.

### Parameteruppdatering
Smootha helst cutoff, Q och drive i parameterdomänen. Byt inte filterkoefficienter abrupt. Testa hög-Q-fall särskilt noga.

## Envelopes och modulation
- ADSR ska vara matematiskt konsekvent och oberoende av blockstorlek.
- UI-parametrar ska smoothas med one-pole eller liknande.
- Audio-rate modulation ska processas samplevis där det faktiskt hörs.
- Lägg in korta ramps för voice start/stop och effekt-bypass för att undvika klick.

## Nonlinearitet och distorsion
- All waveshaping/distorsion ska betraktas som alias-risk.
- Lägg nonlineariteter bakom lokal oversampling: 2x för mild saturation, 4x som normal standard, 8x för hård clipping/aggressiv ladderdist.
- Börja med tanh soft clip. Lägg till andra kurvor senare.
- Kontrollera DC-offset efter asymmetrisk processing.

## Delay och modulationseffekter
- Delay lines ska vara ringbuffrar med tydligt state.
- Fractional delay är obligatoriskt för modulerade delays.
- Linear interpolation duger ofta för chorus/flanger, cubic/Hermite ger högre kvalitet.
- Clamp och smootha delay time, feedback och mix.

## Reverbpolicy
Två kvalitetsnivåer är bra:
1. billig/retro: Schroeder- eller Freeverb-liknande struktur,
2. kvalitetsläge: FDN med 8x8 eller 16x16 delaynät, diffusion, damping och lätt modulation.

Undvik metallisk reverb genom att förbättra:
- modtäthet,
- ekodensitet,
- delayfördelning,
- diffusion,
- subtil modulation.

## Gain staging
- Håll internt headroom.
- Separera drive från output trim.
- Normalisera inte bort all dynamik mellan moduler.
- Testa många röster, hög resonans, unison och effekter tillsammans.

## Exportpolicy
- Rendera internt i float.
- Exportera sedan till målformat.
- Dither precis en gång vid kvantisering till 16-bit/8-bit.
- För tracker-workflow: rendera först så rent som möjligt, applicera sedan medveten retro-degradering om det önskas.

## Tracker-specifika regler
- Tänk på hur samplen låter när de transponeras i trackern, inte bara på root note.
- Rendera flera root notes/multisamples om ett instrument ska pitchas långt.
- För sustain-ljud: loopa där både nivå och lutning matchar, gärna med kort crossfade i workflow om det behövs.
- Baka inte in långa reverbtails om målsystemet ändå inte kan använda dem.

## WASM/Emscripten-regler
- All tung DSP ska ligga i C/WASM, inte i JS.
- Anta inte att AudioWorklet alltid processar exakt 128 frames; använd faktisk blockstorlek.
- Inga allokeringar i process-funktionen.
- Håll JS↔WASM-kommunikation liten och strukturerad.
- Ha minst en single-threaded build som fungerar brett.
- Om pthreads används: bygg separat threaded variant och räkna med SharedArrayBuffer + rätt headers.
- Utnyttja `-msimd128` där profilering visar att det hjälper.

## Kodstruktur
Varje DSP-modul ska helst ha:
- `init`
- `reset`
- `set`/`update_params`
- `process_sample` och/eller `process_block`

Separera state från coeffs/parametrar. Dokumentera parameterintervall och förväntad nivå.

## Testkrav
Ingen modul är klar förrän den har testats för:
- hög tonhöjd och aliasing,
- extrema parameterfall,
- snabb automation,
- stabilitet i feedback,
- frånvaro av klick vid note on/off,
- reproducerbar rendering,
- fungerande tracker-transponering och loopning.

## Rekommenderad första implementation
1. seedad RNG och renderpipeline
2. sinus + PolyBLEP saw/pulse + triangle
3. envelopes + smoothing
4. TPT SVF
5. tanh drive + DC blocker
6. delay + chorus/flanger
7. export + dither
8. multiband wavetable
9. ladderfilter
10. bättre oversampling kring nonlineariteter
11. Freeverb/Schroeder
12. FDN-reverb
13. hard sync och FM/PM-förfining

## Definition of done
En DSP-modul är klar först när den:
- låter bra musikaliskt,
- inte klickar vid rimlig användning,
- inte producerar NaN/Inf,
- har acceptabel aliasnivå,
- har tydliga parametrar och gränser,
- fungerar i både offline-render och WASM-kedjan.
