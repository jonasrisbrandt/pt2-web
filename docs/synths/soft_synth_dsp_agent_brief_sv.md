
# Soft synth DSP-agent brief
### För C som kompileras till WASM med Emscripten, med fokus på att generera högkvalitativa samples till en retro tracker

Det här dokumentet är skrivet som **instruktioner till kodningsagenter**. Målet är inte akademisk fullständighet, utan att ge en tydlig, praktisk standard för hur ni bygger en synth-DSP som låter professionell, är stabil, och fungerar bra i en C → WASM/Emscripten-pipeline.

---

## 1. Uppdraget

Ni implementerar en **musikalisk synthesizer/DSP-motor** som primärt ska användas för att **rendera samples** till en tracker. Det betyder att ni ska optimera för:

1. **Bra ljud först**  
   Låg aliasing, bra filterbeteende vid modulation, inga klick, inga konstiga nivåhopp, inga instabila feedbackslingor.

2. **Deterministisk rendering**  
   Samma input ska ge samma output. Slump ska vara seedad och reproducerbar.

3. **Bra offline-kvalitet med rimliga trade-offs**  
   Eftersom målet är sample-rendering får ni gärna välja dyrare DSP än man hade valt i en strikt realtime-synth, men ni ska fortfarande ha tydliga kostnadsgränser.

4. **Robust WASM-integration**  
   Ingen heap-allokering i audio-processen. Ingen lockning. Ingen I/O. Inga antaganden om att block alltid är 128 samples. Ingen GC-känslighet via JS.

5. **Kod som går att underhålla**  
   Små, testbara DSP-block med väl definierade invariants.

---

## 2. Icke-förhandlingsbara regler

Följ dessa regler konsekvent:

- **Inga heap-allokeringar i audio/process-funktionen.**
- **Inga mutexar, condition variables, sleep, fil-I/O eller logging i audio/process-funktionen.**
- **All state ska vara explicit.**
- **Alla parametrar som kan ändras under spelning ska antingen vara sample-accurate eller smoothede/interpolerade.**
- **Alla återkopplade processer (filter, delay feedback, reverb, waveshapers i feedbackloopar) ska skyddas mot NaN/Inf och oavsiktlig instabilitet.**
- **Local oversampling only**: oversampla bara de block som behöver det, framför allt icke-linjära block.
- **Ingen “naiv” såg/puls/triangel-oscillator i produktion** om den kan spelas i hög tonhöjd eller transponeras upp.
- **Alla moduleringar ska ha definierad rate**: control-rate, block-rate eller audio-rate.
- **Intern signalrepresentation ska vara float32 eller float64 enligt behov, men export ska ske separat.**
- **All export till lägre bitdjup ska ditheras exakt en gång, sist i kedjan.**

---

## 3. Rekommenderad systemarkitektur

Bygg motorn i tre lager:

### A. Event- och parameterlager
Tar emot note on/off, pitch, velocity, makroparametrar, automation och modulationsroutning.

### B. Voice-/DSP-lager
Innehåller oscillatorer, envelopes, filter, nonlineariteter, LFO:er, delay/reverb-send osv.

### C. Render-/exportlager
Tar DSP-output, gör eventuell oversampling/decimering, limitering eller headroom-hantering, och skriver samples/loopar i målformat.

### Rekommenderad signalväg per röst
För en subtraktiv grunddesign:

`oscillatorbank -> mixer -> pre-filter drive -> filter -> post-filter drive -> amp env -> voice effects -> voice out`

Globalt:

`sum voices -> bus saturation (valfritt) -> chorus/delay/reverb -> output trim -> exporter`

### Realtime-läge vs offline-läge
Bygg helst två kvalitetsnivåer:

- **Preview/realtime**
  - enklare oversampling
  - färre reverb-linjer
  - enklare modulation
- **Offline/final render**
  - högre intern kvalitet
  - mer oversampling i dist/filter
  - bättre decimering
  - längre tailrendering

För en tracker-sample-pipeline är det ofta bättre att lägga mer CPU i **offline-bounce** än i preview.

---

## 4. Samplerate-strategi

### Grundregel
Intern processing kan köras på host-samplerate, men för offline sample-rendering bör ni överväga:

- att rendera hela patchen på en **högre samplerate**,
- eller att använda **lokal oversampling** i de block som genererar mest aliasing.

### Praktisk rekommendation
- För vanliga oscillatorer med bra bandlimitering räcker det ofta att köra på målsamplerate.
- För hård distorsion, resonanta icke-linjära filter, aggressiv FM/PM och hård sync: använd **2x–8x lokal oversampling** runt just dessa block.
- För offline-export till 44.1 kHz-baserade format är 88.2/176.4 kHz bekvämt; för 48 kHz-baserade format är 96/192 kHz bekvämt.

### Viktig princip
**Oversampla inte hela motorn slentrianmässigt.** Det slösar CPU och minne. Identifiera i stället var nya övertoner skapas.

---

## 5. Oscillatorer: hur man gör dem professionella

Professionella oscillatorer handlar om tre saker:

1. **Stabil pitch/phase**
2. **Låg aliasing**
3. **Bra beteende vid modulering och edges/discontinuities**

### 5.1 Grundläggande fasackumulator

Använd en fas `phase` i intervallet `[0, 1)`.

```c
phase += freq * inv_sample_rate;
phase -= floorf(phase);
```

För hög precision över lång tid kan ni:
- hålla fas i `double`,
- eller wrapa explicit utan att låta värdet växa okontrollerat.

Undvik att låta oscillator-state drifta eller bero på undefined behavior.

---

### 5.2 Sine

För sinus finns flera bra val:

#### Val A: direkt `sinf`
Bra för enkelhet och precision, särskilt offline.

#### Val B: wavetable
Bra om ni vill ha hög throughput och kontrollerad interpolation.

#### Val C: rekursiv sinusoscillator
Kan vara mycket billig men kräver omsorg för numerisk stabilitet och frekvensändringar.

**Rekommendation:**  
För en synthmotor där resten ändå dominerar CPU är `sinf` eller en liten interpolerad wavetable ofta fullt tillräckligt.

---

### 5.3 Varför naiva såg/puls/triangel låter dåligt

Naiva klassiska vågformer har discontinuities eller knäckar i derivatan. Det kräver i princip oändlig bandbredd. I digital form viks energi över Nyquist ned som aliasing.

Konsekvens:
- högre toner låter “grusiga”, “metalliska” eller “glasiga”,
- filter och distorsion förstärker skräpet,
- tracker-samples transponerade uppåt avslöjar snabbt aliasing.

---

### 5.4 Standardval för såg/puls/triangel: PolyBLEP

**Standardrekommendation för produktion:**  
Implementera **PolyBLEP** som default för såg, puls och relaterade vågformer.

Varför:
- mycket bra kvalitet per CPU,
- litet minnesbehov,
- fungerar bra i C/WASM,
- lätt att modulera pitch på,
- mycket bättre baseline än naiva oscillatorer.

#### Minimal PolyBLEP-kärna

```c
static inline float poly_blep(float t, float dt)
{
    if (t < dt) {
        t /= dt;
        return t + t - t * t - 1.0f;
    }
    if (t > 1.0f - dt) {
        t = (t - 1.0f) / dt;
        return t * t + t + t + 1.0f;
    }
    return 0.0f;
}
```

#### Saw

```c
float osc_saw_polyblep(float phase, float dt)
{
    float y = 2.0f * phase - 1.0f;
    y -= poly_blep(phase, dt);
    return y;
}
```

#### Pulse

```c
float osc_pulse_polyblep(float phase, float dt, float pw)
{
    float y = (phase < pw) ? 1.0f : -1.0f;
    y += poly_blep(phase, dt);
    float t2 = phase - pw;
    if (t2 < 0.0f) t2 += 1.0f;
    y -= poly_blep(t2, dt);
    return y;
}
```

#### Triangle
En bra triangel fås ofta genom att:
- generera en bandbegränsad square,
- och sedan integrera den med lämplig skalning och eventuell liten leak/DC-kontroll.

```c
typedef struct {
    float z;
} TriState;

float osc_triangle_from_square(TriState* s, float square, float dt)
{
    // Enkel leaky integrator
    float leak = 0.9995f;
    s->z = leak * s->z + (square * dt * 2.0f);
    return s->z;
}
```

#### Notering
Integrerad square kräver nivåtrim och ofta en DC-/driftkontroll. Testa och kalibrera noga.

---

### 5.5 När PTR eller DPW är intressant

**PTR (Polynomial Transition Regions)** och **DPW (Differentiated Polynomial Waveforms)** är också seriösa alternativ.

Välj dem när ni vill:
- minimera CPU ytterligare,
- experimentera med andra cost/quality-punkter,
- eller separera oscillatorfamiljer efter användningsfall.

Praktisk tumregel:
- **PolyBLEP** är det säkra defaultvalet.
- **PTR** är intressant om ni vill pressa CPU och ändå hålla hög kvalitet.
- **DPW** kan vara elegant för vissa vågformer, men ni måste utvärdera ljud, transients och modulering mer noggrant.

---

### 5.6 Hard sync

**Naiv hard sync aliasar extremt hårt.**

Om ni implementerar hard sync professionellt:
- använd **MinBLEP/BLEP-liknande stegkorrigering** eller annan bandbegränsad edge-rekonstruktion,
- behandla varje reset/discontinuity som ett bandbegränsat event.

**Regel:** hard sync får aldrig byggas som “bara nollställ slave phase” och sedan hoppas på det bästa.

---

### 5.7 PWM

PWM är musikaliskt användbart men känsligt:
- båda pulskanterna måste bandbegränsas,
- snabb PWM-modulation kan skapa extra spektrum och avslöja svagheter.

Regler:
- clampa pulse width, t.ex. `0.02f .. 0.98f`,
- använd två PolyBLEP-korrigeringar (en per kant),
- smootha control-rate PWM om den kommer från UI/automation.

---

### 5.8 Wavetable-oscillatorer

För generella spektra eller användardefinierade vågformer är **bandbegränsade multitabeller** ofta bäst.

#### Gör så här
Preberäkna flera versioner av samma vågform:
- en fullbandig för låga toner,
- progressively low-passade varianter för högre register.

Vid rendering:
- välj tabell efter grundfrekvens,
- interpolera i tabellen,
- gärna crossfade mellan tabeller för att undvika hopp.

#### Varför inte en enda tabell?
En enda tabell med interpolation minskar främst amplitudfel men löser inte aliasing ordentligt när vågformen innehåller höga partialer.

#### När wavetables är rätt val
- komplexa periodiska spektra,
- additive/offline-genererade single cycles,
- användarritade vågformer,
- tracker-orienterade single-cycle-libraries.

---

### 5.9 Noise-oscillatorer

Implementera minst:
- white noise,
- pink/noise-tilt (valfritt),
- sample-and-hold/random-step (valfritt).

För determinism:
- använd en enkel, reproducerbar RNG, t.ex. xorshift, PCG eller SplitMix-baserad lösning,
- seed per render eller per röst.

White noise ska vara:
- zero-mean,
- reproducerbar med seed,
- utan beroende av plattformsspecifik `rand()`.

---

### 5.10 FM, PM och phase modulation

FM/PM låter fantastiskt men aliasar lätt eftersom sidebands snabbt passerar Nyquist.

Regler:
- börja med **sinusbaserad PM/FM**,
- begränsa modulation index i realtime-läge,
- erbjud högre kvalitet i offline-läge,
- överväg lokal oversampling för hård FM/feedback FM.

Feedback-FM är särskilt känsligt. Om det ska låta “DX-likt” men renare:
- håll intern nivå under kontroll,
- överväg en lågpassad återkoppling,
- oversampla om ljudet blir vasst/aliasigt i hög tonhöjd.

---

### 5.11 Unison/supersaw

För bra unison:
- använd flera oscillatorer med definierad detune-kurva,
- sprid initialfas med kontroll,
- normalisera energi på ett musikaliskt sätt,
- undvik att summan klipper bara för att fler röster aktiveras.

Rekommendation:
- använd inte bara linjär gain `1/N`; lyssningstesta en “equal power”-liknande skalning.
- ge låg random drift eller subtil chorusing om det passar estetiken.

---

## 6. Filter: vad som låter professionellt

Den största skillnaden mellan “amatör-DSP” och “proffs-DSP” i synthar ligger ofta i filtren.

Mål:
- stabilitet,
- bra frekvensgång,
- bra tidsvarierande beteende,
- musikalisk resonans,
- snygg modulering utan klick/instabilitet.

---

### 6.1 Defaultval: TPT/ZDF State Variable Filter

**Default för multimode synthfilter ska vara ett TPT/ZDF-baserat state variable filter.**

Varför:
- mycket bra när cutoff och Q moduleras,
- beter sig mer analog-likt vid tidsvariation än många direkta koefficientmetoder,
- enkelt att få LP/BP/HP/Notch ur samma kärna.

Ett vanligt TPT-SVF-upplägg:

```c
typedef struct {
    float ic1eq, ic2eq;
} SvfState;

typedef struct {
    float g;   // tan(pi * fc / fs)
    float k;   // 1/Q eller relaterad resonansparameter
} SvfCoeffs;

static inline void svf_set(SvfCoeffs* c, float fc, float q, float fs)
{
    if (fc < 5.0f) fc = 5.0f;
    float ny = 0.49f * fs;
    if (fc > ny) fc = ny;
    c->g = tanf((float)M_PI * fc / fs);
    c->k = 1.0f / q;
}

static inline void svf_process(
    SvfState* s, const SvfCoeffs* c, float x,
    float* hp, float* bp, float* lp)
{
    float g = c->g;
    float k = c->k;

    float a1 = 1.0f / (1.0f + g * (g + k));
    float a2 = g * a1;
    float a3 = g * a2;

    float v3 = x - s->ic2eq;
    float v1 = a1 * s->ic1eq + a2 * v3;
    float v2 = s->ic2eq + a2 * s->ic1eq + a3 * v3;

    *hp = x - k * v1 - v2;
    *bp = v1;
    *lp = v2;

    s->ic1eq = 2.0f * v1 - s->ic1eq;
    s->ic2eq = 2.0f * v2 - s->ic2eq;
}
```

### Viktiga regler för TPT/SVF
- smootha cutoff och resonance,
- clampa cutoff under Nyquist med marginal,
- håll Q inom rimliga gränser,
- testa extrema modulationsfall.

---

### 6.2 När biquads är rätt val

Biquads är bra för:
- EQ,
- tone controls,
- notch/peaking,
- utility-filter,
- billiga HP/LP i perifera delar av kedjan.

Biquads är **inte** mitt förstaval som huvudfilter i en hårt modulerad synth om målet är “analog känsla”. Där vinner ofta TPT/ZDF.

Regel:
- använd **biquads för EQ och utility**,
- använd **TPT/ZDF för synthens huvudkaraktär**.

---

### 6.3 Koefficientuppdatering och parameterinterpolation

Att bara räkna om filterkoefficienter och byta dem tvärt kan ge:
- klick,
- plopp,
- oväntad resonansboost under transition,
- i värsta fall clipping eller instabilt beteende.

Regler:
- smootha cutoff/resonance i parameterdomänen,
- eller interpolera filterkoefficienter försiktigt,
- men för hög-Q-filter: lita inte blint på enkel linjär koefficientinterpolation.

**Bäst praktik:**  
För synthfilter: smootha **fysiska parametrar** (cutoff, Q, drive) och räkna uppdaterade filterparametrar ofta.  
För EQ/biquads: använd försiktig parameterinterpolation, och testa hög-Q-fall separat.

---

### 6.4 Ladderfilter

När ni vill ha “klassisk synthkaraktär”, gör ett ladderfilter som separat mode.

Det finns tre nivåer:

#### Nivå 1: enkel linjär ladderapproximation
Billigare, lättare att kontrollera, mindre “analog”.

#### Nivå 2: TPT/ZDF-ladder
Bra kompromiss mellan realism, stabilitet och modulation.

#### Nivå 3: icke-linjärt ladder med saturerande steg (t.ex. tanh)
Musikaliskt attraktivt men dyrare och känsligare.

Regler för icke-linjärt ladder:
- oversampla lokalt,
- kalibrera cutoff tracking,
- kalibrera resonans så att självsvängning är kontrollerad,
- håll input drive och intern headroom separata.

**Viktigt:** om ni använder en Huovilainen-liknande eller annan icke-linjär modell måste ni förvänta er att stark drive skapar nya övertoner → mer aliasing → större behov av oversampling.

---

### 6.5 Filter drive och saturation

Professionella synthar låter ofta bättre när filtret inte är helt linjärt.

Bra val:
- pre-filter drive,
- stage-wise saturation,
- post-filter saturation,
- feedback drive i begränsad dos.

Men:
- varje icke-linjär punkt skapar övertoner,
- resonans + drive + hög cutoff är en alias-fälla,
- använd inte distorsion “gratis”; besluta var karaktären ska uppstå.

Rekommendation:
- börja med **en enkel tanh-drive före filtret**,
- utöka senare till mer avancerad modell.

---

### 6.6 Utility-filter som alltid behövs

Implementera små, billiga standardfilter:

- **DC blocker**
- **slew limiter / parameter smoother**
- **one-pole LP/HP**
- **tone tilt / damping one-poles**

En enkel DC blocker:

```c
typedef struct {
    float x1, y1;
} DcBlockState;

static inline float dc_block(DcBlockState* s, float x)
{
    const float R = 0.995f;
    float y = x - s->x1 + R * s->y1;
    s->x1 = x;
    s->y1 = y;
    return y;
}
```

Använd DC blocker:
- efter asymmetrisk distortion,
- i återkopplade delay/reverb-slingor om bias driver iväg,
- efter vissa filtermodeller.

---

## 7. Envelopes, smoothing och modulation

Bra synth-DSP faller ihop om moduleringen är slarvig.

---

### 7.1 Envelope-regler

ADSR som låter musikaliskt bör ofta använda:
- snabb/linjär attack,
- exponential-lik decay/release,
- tydligt definierad sustainnivå.

Regel:
- implementera envelope-segment som **matematiskt konsekventa** och inte beroende av blockstorlek.
- event måste kunna landa sample-accurate i offline-rendering.

För enklare smoothing av parametrar:
```c
typedef struct {
    float z;
    float a; // exp(-1/(tau*fs))
} Smooth1;

static inline void smooth1_set_time(Smooth1* s, float tau_sec, float fs)
{
    if (tau_sec < 1e-6f) tau_sec = 1e-6f;
    s->a = expf(-1.0f / (tau_sec * fs));
}

static inline float smooth1_process(Smooth1* s, float x)
{
    s->z = x + s->a * (s->z - x);
    return s->z;
}
```

---

### 7.2 Vad ska smoothas?

Smootha i princip alltid:
- cutoff från UI,
- resonance från UI,
- oscillator mix,
- drive,
- gain,
- pan,
- PWM från långsam modulation/UI,
- effect mix,
- delay time om ni inte använder särskild tidsmodulationsteknik.

Smootha **inte** nödvändigtvis:
- audio-rate modulation,
- avsiktliga snabba envelopes,
- sample-accurate pitch envelopes som ska vara “skarpa”.

---

### 7.3 Audio-rate modulation

Om ni vill ha “proffssynth”-nivå:
- stöd åtminstone delvis audio-rate modulation för pitch, PWM, filter cutoff eller FM/PM.
- separera tydligt:
  - block-rate params,
  - control-rate modulering,
  - audio-rate mod signaler.

Regel:
- när modulation faktiskt ska vara audio-rate, processa den sample för sample.
- fuska inte med blockkonstanta värden där det hörs.

---

### 7.4 Click-skydd

Inför små rampningar:
- vid voice start,
- vid voice kill,
- vid abrupt sample restart,
- vid bypass on/off för effekter.

En 16–128 samples lång gain-ramp räddar många fel.

---

## 8. Icke-linjära block: distortion, clipping, waveshaping

Det är här mycket “dyrt men bra” händer.

---

### 8.1 Varför aliasing blir värre

Varje waveshaper, clipper eller saturator skapar nya partialer. Om de ligger över Nyquist aliasar de tillbaka.

Det gäller särskilt:
- hård clipping,
- foldback,
- ladder med stark intern mättnad,
- distortion inne i feedbackloopar,
- resonant filter med drive.

---

### 8.2 Rätt strategi: lokal oversampling

Defaultstrategi:
- wrapa varje icke-linjärt block i ett eget oversampling-skal.

Exempel:
`upsample -> nonlinear block -> lowpass/decimate`

Bra startnivåer:
- **2x**: mild saturation
- **4x**: normal synth drive
- **8x**: hård clipping, hård ladderdist, aggressiv FM/feedback + dist

---

### 8.3 Oversamplingfilter

Ni behöver två saker:
- interpolerande uppsampling,
- bra decimering ned igen.

Praktiska val:
- enkel linjär interpolation på uppvägen kan vara helt OK i många fall,
- decimering måste vara bättre än “bara ta var N:te sample”.

Bra kompromisser:
- polyphase FIR,
- elliptic/IIR där latens och fasfel är acceptabla,
- CIC bara om ni vet exakt varför och kompenserar vid behov.

**Regel:** nedsampling måste vara starkare än den mest slarviga uppsampling ni tillåter.

---

### 8.4 Distortiontyper att börja med

Implementera i denna ordning:

1. **tanh soft clip**
2. **cubic soft clip**
3. **hard clip**
4. **asymmetric clip**
5. **foldback / wavefolder** (senare)

En bra tanh-softclipper:

```c
static inline float sat_tanh(float x, float drive)
{
    return tanhf(drive * x);
}
```

Men:
- separera `drive` från `output trim`,
- normalisera inte bort all karaktär,
- kontrollera DC.

---

### 8.5 Avancerat senare: ADAA / kontinuerlig approximation

När ni vill pressa aliasing längre utan extrem oversampling kan ni senare utvärdera:
- ADAA-liknande metoder,
- kontinuerlig-tids-approximationer kring waveshapers,
- analytiskt korrigerade nonlineariteter.

Detta är “andra vågen”-arbete. Börja med lokal oversampling; det ger mest värde snabbt.

---

## 9. Delay, chorus, flanger och phaser

---

### 9.1 Delay line-grund

Använd ringbuffer med explicit write/read-index.

Krav:
- inget modulo med långsamma `%` i inner loop om det går att undvika,
- maskning fungerar om buffertstorleken är tvåpotens,
- annars branch wrap.

---

### 9.2 Fractional delay

För modulerade delays måste read-position kunna ligga mellan samples.

Vanliga val:

#### Linear interpolation
- billig,
- ofta tillräcklig för chorus/flanger,
- lite dämpning i toppen.

#### Cubic/Hermite interpolation
- bättre toppregister,
- dyrare,
- bra för “fint” delay/reverb-ljud.

#### Allpass fractional delay
- bevarar amplitud bättre,
- annan fas,
- användbart i vissa delay/reverb-strukturer.

Rekommendation:
- **linear** för enkla modulationseffekter,
- **cubic/Hermite** när kvalitet märks,
- utvärdera allpass där fasbeteende är önskvärt.

---

### 9.3 Chorus

Bra chorus kräver:
- modulerade korta delays,
- flera linjer,
- olika LFO-faser,
- lite diffusion eller tonformning,
- gärna HP/LP för att undvika gröt.

Undvik:
- exakt samma LFO på alla linjer,
- för djup modulation utan nivåkontroll,
- för ren återkoppling om ni vill undvika metallisk ton.

---

### 9.4 Flanger

Flanger är i praktiken:
- mycket kort delay,
- modulation,
- feedback,
- dry/wet-summation.

Risker:
- stark feedback + snabb modulation kan poppa eller bli numeriskt vass.
- clampa parametrar,
- smootha feedback och mix.

---

### 9.5 Phaser

En phaser byggs ofta av en serie allpassfilter vars centerfrekvenser moduleras.

Regler:
- välj stage count efter karaktär,
- lägg till feedback sparsamt,
- smootha parametrar,
- se upp med DC och stora gaintoppar.

---

## 10. Reverb: vad som låter billigt vs professionellt

Reverb är ett område där arkitektur betyder mycket.

---

### 10.1 Billig men användbar klass: Schroeder / Freeverb-liknande

Klassisk billig reverb:
- parallella combfilter med damping i feedback,
- följt av diffuserande allpasskedjor.

Fördelar:
- enkel,
- snabb,
- “retro digital”-vänlig,
- bra för tracker-estetik om man vill ha karaktär.

Nackdelar:
- kan bli metallisk,
- låg mod-/ekodensitet avslöjas snabbt,
- sämre realism och rumskänsla.

Det här är helt OK som:
- billig insert,
- 90-tal/retro-ambience,
- preview-mode,
- kreativa tails.

---

### 10.2 Professionellt default: FDN-reverb

För bättre reverbkvalitet, använd en **FDN (Feedback Delay Network)**.

Rekommenderad struktur:
- 8x8 eller 16x16 delaynät,
- ortogonal feedbackmatris (Householder, Hadamard eller annan energi-bevarande/kontraherande struktur),
- delaylängder som inte är trivialt relaterade,
- input diffusion,
- output taps/mixning,
- dampingfilter per slinga,
- lätt modulation för att bryta statiska modes.

Detta ger:
- högre modtäthet,
- högre ekodensitet,
- mindre metallisk karaktär,
- bättre “professionell” svans.

---

### 10.3 Vad som orsakar metallisk reverb

Metallisk eller “ringig” känsla beror ofta på:
- för få delaylinjer,
- för låg modtäthet,
- dåligt valda delaytider,
- för lite diffusion,
- ingen modulation,
- för smala resonansmönster.

Praktiska motåtgärder:
- fler linjer,
- bättre delayfördelning,
- fler diffuseringssteg,
- subtil modulation,
- tonformning i loopen,
- separata early reflections.

---

### 10.4 Echo density vs mode density

Två centrala begrepp:

- **Mode density**: hur tätt resonansmoderna ligger.
- **Echo density**: hur snabbt mängden ekon ökar över tid.

Om mode density är för låg blir reverbet tonalt/metalliskt.  
Om echo density är för låg blir svansen “rattlig”, gles eller kornig.

Regel:
- jaga inte bara lång decay; jaga också täthet.

---

### 10.5 Damping och tonal shaping

Bra reverb behöver:
- lågpass eller tilt i feedbackslingor,
- ibland även en lätt highpass,
- predelay,
- separat kontroll för early/late balance.

Regel:
- decay ska inte bara vara “feedback gain”.
- klangfärg över tid är minst lika viktig som RT60.

---

### 10.6 Rekommenderad reverb-roadmap

Implementera i denna ordning:

1. enkel delay
2. chorus/flanger
3. Freeverb-liknande eller Schroeder-reverb
4. bättre diffusering
5. FDN 8x8
6. FDN 16x16 med modulation och early reflections

För tracker-sample-rendering är en välgjord 8x8 FDN ofta mer än tillräcklig.

---

## 11. Gain staging och headroom

Många “dåliga DSP:er” faller på gain staging.

Regler:
- internt ska det finnas headroom,
- särskilj “drive för karaktär” från “output gain”,
- normalisera inte varje modul urskillningslöst,
- testa många röster samtidigt,
- testa hög resonans + unison + effekter.

Praktisk policy:
- håll voice outputs ungefär kring användbar nivå,
- låt bussar ha extra marginal,
- limitera eller normalisera först i exportsteget om det verkligen behövs.

För tracker-samples är det ofta bättre att lämna lite headroom än att maxa allt till 0 dBFS.

---

## 12. Bit depth, export och dither

Intern rendering ska ske i float.  
När ni exporterar till 16-bit eller 8-bit:

- dither **en gång**,
- sist i kedjan,
- aldrig flera gånger.

För 16-bit:
- TPDF-dither räcker långt.
- noise shaping är valfritt om ni verkligen behöver det.

För 8-bit eller annan aggressiv reduktion:
- dither är fortfarande relevant,
- men det estetiska valet kan vara att medvetet inte maskera allt om “retro grit” är önskad.
- gör detta som **ett konstnärligt slutsteg**, inte som oavsiktlig förstöring tidigare i kedjan.

Exempel TPDF:

```c
float tpdf_dither(uint32_t* rng)
{
    float a = rng_uniform_0_1(rng);
    float b = rng_uniform_0_1(rng);
    return a - b;
}
```

Sedan:
- skala dithern till 1 LSB i målformat,
- applicera precis före kvantisering,
- kvantisera,
- klart.

---

## 13. Tracker-specifika råd

Eftersom målet är samples till en tracker gäller andra prioriteringar än i en “live synth plugin”.

---

### 13.1 Rendera hellre renare än “retro” först

Bästa arbetsflödet:
1. generera ett **rent och högkvalitativt** sample,
2. gör sedan medveten degradering:
   - bitcrush,
   - samplerate-reduktion,
   - gammal DAC-karaktär,
   - limiterad bandbredd,
   - tracker-loopning.

Det är mycket lättare att lägga till “retro” än att rädda ett redan aliasigt grundmaterial.

---

### 13.2 Root note och multisampling

Bestäm tydligt:
- root key,
- hur långt upp/ned samplen ska transponeras,
- om flera zoner behövs.

Om en sample ska pitchas långt:
- överväg multisampling eller flera renderade root-noter,
- annars kan även en bra synth få oönskad karaktär efter kraftig tracker-transponering.

---

### 13.3 Loopning

För sustain-ljud:
- rendera tillräckligt lång steady-state,
- hitta loopsegment där både nivå och lutning matchar,
- använd gärna kort crossfade-loop om formatet tillåter workflowmässigt,
- kontrollera hur samplen låter vid transponering, inte bara på root key.

Bra loopar är ofta viktigare än maximal syntteknisk realism.

---

### 13.4 Svansar och reverb

Om målsystemet har begränsat RAM eller samplelängd:
- gör kortare reverbtails,
- eller exportera torra samples och använd trackerns egna effekter,
- eller baka bara den karaktär som är avgörande.

Regel:
- baka inte in lång svans om den ändå kommer kapas eller förstöras av tracker-formatet.

---

### 13.5 Konsistent nivåpolicy

Normalisera inte allt till exakt samma peak om ni vill behålla instrumentkänsla.

Bättre:
- definiera en target loudness/headroom-policy,
- håll kick, snare, bass, pad, lead i rimliga relationer,
- spara lite toppmarginal.

---

## 14. Numerisk robusthet

---

### 14.1 Skydd mot NaN/Inf

Varje block med feedback eller division ska ha guardrails.

Exempel:
- clampa Q,
- clampa cutoff,
- clampa delay time,
- undvik division med extremt små tal,
- återställ state om NaN upptäcks i debug builds.

---

### 14.2 Subnormals/denormals

Återkopplade filter och reverbs kan falla ned i extremt små tal.

Motåtgärder:
- mycket liten DC/noise-injektion,
- explicit zeroing under tröskel,
- testning av långa tails.

---

### 14.3 Determinism

För sample-rendering måste ni få samma resultat över körningar så långt det är praktiskt.

Regler:
- seedad RNG,
- undvik beroende på oinitierat state,
- undvik ospecificerad iteration över hashstrukturer,
- definiera compile flags konsekvent.

---

## 15. Prestanda och data-layout

---

### 15.1 Strukturera state tydligt

Bra DSP-kod i C:
- separerar coeffs från state,
- separerar init/set/process,
- håller data tät och cachevänlig,
- exponerar tydlig process-signatur.

Exempel:
```c
void filter_set(Filter* f, float cutoff, float q, float fs);
float filter_process(Filter* f, float x);
```

---

### 15.2 Block vs sample processing

Bra mönster:
- kontroll och param-uppdatering blockvis,
- kritiska DSP-block samplevis.

Ni kan också använda:
- blockprocess för oscillatorbanker och effekter,
- sampleprocess inuti där feedback/modulation kräver det.

---

### 15.3 Branching

Branchless kod är inte automatiskt bättre.

Regel:
- skriv först korrekt och tydligt,
- profilera sedan,
- branchless tricks ska motiveras av profilerad flaskhals.

---

### 15.4 SIMD

När en loop verkligen dominerar CPU:
- överväg WASM SIMD,
- särskilt för voice-summation, enkla filtersvep, gain, tabellinterpolation, vektoriserbara oscillatorbanker.

Men:
- tvinga inte in SIMD i block med massiv state/feedback om det gör koden sämre.
- använd SIMD där dataflödet faktiskt passar.

---

## 16. WASM/Emscripten-specifika instruktioner

---

### 16.1 AudioWorklet är rätt väg för låg latens i webben

Om synthmotorn ska köras interaktivt i browsern:
- använd **AudioWorklet**-baserad arkitektur,
- håll JS-sidan tunn,
- kör DSP i Wasm där möjligt.

Regel:
- allt tungt DSP-arbete ska ligga i C/WASM, inte i JS.

---

### 16.2 Anta inte att blockstorleken alltid är 128

Många implementationer använder 128 frames per callback, men kod ska inte hårdkoda detta.

Regel:
- process-funktioner ska ta `num_frames` explicit,
- alla loopar ska använda faktisk blockstorlek,
- inga fasta stack-arrayer med “128” utan anledning.

---

### 16.3 Inga allokeringar i `process`

Audio callback/worklet-process:
- får inte allokera,
- får inte skapa temporära växande strukturer,
- får inte kopiera onödigt mellan JS och WASM.

Allt ska vara förallokerat.

---

### 16.4 Threads/pthreads

Om ni använder Emscripten pthreads:
- bygg en separat threaded variant,
- räkna med krav på SharedArrayBuffer och rätt cross-origin headers,
- anta inte att en och samma binär ska “falla tillbaka” elegant mellan threaded och non-threaded.

Rekommendation:
- ha minst en **single-threaded default build** som fungerar överallt,
- gör threaded/offline-render builds separat om det ger värde.

---

### 16.5 Rekommenderade compile-flags att börja från

Preview/dev:
```bash
-O1 -g
```

Release, single-thread:
```bash
-O3 -flto -msimd128 -fno-exceptions -fno-rtti
```

Threaded variant när ni verkligen behöver det:
```bash
-O3 -flto -pthread -msimd128
```

Notera:
- `-fno-exceptions` och `-fno-rtti` bara om koden inte behöver dem.
- utvärdera `-O2`, `-O3` och `-Os` mot faktisk workload.
- `-sALLOW_MEMORY_GROWTH=1` kan vara praktiskt, men försök ändå förallokera rimligt.

---

### 16.6 AudioWorklet-laddning

Om ni laddar in i egen `AudioContext` och worklet:
- var uppmärksam på hur Wasm initieras,
- använd en strategi som fungerar med AudioWorklet-begränsningar,
- minimera JS-interop och meddelanden.

Regel:
- designa tydlig parameter- och event-överföring mellan huvudtråd och worklet.
- stora dumpningar av state varje block är förbjudna.

---

## 17. Testplan: så vet ni att DSP:n är bra

Ni ska inte lita på örat enbart. Testa systematiskt.

---

### 17.1 Oscillatortester
- rendera hög tonhöjd,
- rendera pitch sweep upp mot Nyquistområdet,
- inspektera spektrum och lyssna efter aliasing,
- testa PWM-modulation,
- testa hard sync.

### 17.2 Filtertester
- impulssvar,
- sinus sweep,
- snabb cutoff-modulation,
- hög resonans nära självsvängning,
- drive in/ut,
- stabilitet vid extrema parametrar.

### 17.3 Nonlinearitetstester
- låg och hög drive,
- med/utan oversampling,
- jämför aliasing i spektrum,
- kontrollera DC-offset.

### 17.4 Reverbtester
- impulssvar,
- lyssna på metalliska modes,
- kontrollera tail density,
- lång decay vid låg nivå,
- mono-in/stereo-ut och stereo-in/stereo-ut.

### 17.5 Tracker-relevanta tester
- transponera samplen i måltrackern,
- kontrollera loopar,
- lyssna i mix, inte bara solo,
- testa korta och långa noter.

### 17.6 Regressions-/golden-file-tester
För viktiga patcher:
- rendera referensfiler,
- jämför numeriskt eller perceptuellt,
- fånga oavsiktliga förändringar tidigt.

---

## 18. Rekommenderad baseline-stack

Om ni vill bygga en stark första version snabbt, använd detta:

### Oscillatorer
- sinus: `sinf` eller liten interpolerad wavetable
- saw/pulse: PolyBLEP
- triangle: integrerad bandbegränsad square
- noise: seedad white noise
- wavetable: bandbegränsade multitabeller

### Filter
- huvudfilter: TPT/ZDF SVF multimode
- utility/EQ: biquads
- färgfilter: valfritt laddermode senare

### Drive
- `tanh` soft clip
- lokal 4x oversampling runt distortion/filter när det behövs

### Modulation
- sample-accurate envelopes
- one-pole smoothing för UI-parametrar
- tydlig separation mellan control-rate och audio-rate

### Effekter
- delay med fractional read
- chorus/flanger på modulerad delay
- enkel Freeverb/Schroeder först
- FDN 8x8 som kvalitetsreverb senare

### Export
- offline high-quality render
- bra decimering
- dither sist

---

## 19. När man ska välja vad

### Välj PolyBLEP när:
- ni vill ha bästa allroundvalet för klassiska vågformer,
- minne är viktigare än stora tabeller,
- ni vill hålla implementationen kompakt.

### Välj multiband-wavetable när:
- vågformen är komplex men periodisk,
- ni vill ha exakt formkontroll,
- ni kan acceptera mer minne.

### Välj TPT/ZDF SVF när:
- filtret ska moduleras mycket,
- synthkänsla är viktig,
- ni behöver multimode från en kärna.

### Välj biquad när:
- ni gör EQ eller utility-filter,
- modulationen är begränsad,
- ni vill hålla CPU låg.

### Välj Freeverb/Schroeder när:
- “retro digital” duger eller önskas,
- CPU måste vara låg,
- det bara är en stödjande effekt.

### Välj FDN när:
- reverbkvalitet spelar stor roll,
- ni vill undvika metallisk känsla,
- offline rendering tillåter lite högre kostnad.

### Välj lokal oversampling när:
- blocket är icke-linjärt,
- aliasing hörs,
- totalmotorn inte ska bli onödigt dyr.

---

## 20. Vanliga misstag att undvika

- Naiv saw/pulse i produktion.
- Ingen parameter-smoothing.
- Att byta filterkoefficienter tvärt.
- Att oversampla hela motorn i stället för rätt block.
- Att använda distortion utan output trim och DC-kontroll.
- Att tro att interpolation i en enda wavetable “löser aliasing”.
- Att anta att browser-audio alltid är exakt 128 frames.
- Att allokera eller logga i audio callback.
- Att baka in för mycket reverb i ett tracker-sample.
- Att dithera flera gånger.
- Att försöka få “retro” genom dålig grundkvalitet i stället för medveten degradering sist.

---

## 21. Prioriterad implementationsordning

Bygg i den här ordningen:

1. seedad RNG och grundläggande renderpipeline
2. PolyBLEP saw/pulse + sinus + triangle
3. envelope + smoothing + gain staging
4. TPT SVF
5. basic tanh drive + DC blocker
6. delay + chorus/flanger
7. offline export + dither
8. wavetable-bank
9. ladderfilter
10. bättre oversampling runt nonlineariteter
11. Freeverb/Schroeder
12. FDN-reverb
13. audio-rate modulationförfining
14. specialfall: hard sync, FM/PM, wavefolder

---

## 22. Kort policy för kodstil

All DSP-kod ska:

- vara ren C eller mycket återhållsam C-kompatibel C++-stil om det behövs,
- ha `init/set/process/reset`,
- skilja på coefficients och state,
- ha dokumenterade parameterintervall,
- ha debug asserts i icke-realtime delar,
- ha små, testbara enheter,
- inte blanda UI-logik med DSP-kärna.

---

## 23. “Definition of done”

En DSP-modul är inte “klar” förrän den:

- låter bra i musikalisk användning,
- klarar extrema parametrar utan NaN/Inf,
- inte klickar vid rimlig automation,
- har testats i hög tonhöjd,
- har rimlig CPU-kostnad,
- har tydliga parametergränser,
- fungerar lika i offline-render och webbljudkedjan.

---

## 24. Sammanfattning i en mening

**Bygg rena, bandbegränsade oscillatorer; använd TPT/ZDF-filter för tidsvarierande stabilitet; lägg nonlineariteter bakom lokal oversampling; välj FDN om reverbet ska låta “dyrt”; exportera med ett enda slutligt dithersteg; och håll hela C/WASM-kedjan deterministisk, allokeringsfri och testad mot tracker-användning.**

---

## 25. Referenser att känna till

Det här dokumentet bygger i första hand på följande källtyper och klassiker:

- Vesa Välimäki m.fl. om bandbegränsade klassiska vågformer och PolyBLEP-liknande metoder.
- Zavalishin, *The Art of VA Filter Design*.
- Huovilainen om icke-linjär digital Moog-laddermodellering.
- Kalinichenko om säker och mjuk parameterinterpolation för tidsvarierande biquads.
- Schlecht m.fl. om designtrade-offs i FDN-reverb.
- Parker m.fl. och Kahles m.fl. om aliasreduktion och oversampling för nonlineariteter.
- Emscriptens officiella dokumentation för Audio Worklets, pthreads, SIMD och optimering.
- MDN/Web Audio-specifikationen kring AudioWorklet-processering.
- MIT:s material om dithering och mastering.

