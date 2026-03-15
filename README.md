# pt2-web

Hybridport av `p2-clone` där appen byggs som ett modernt Vite/TypeScript-skal runt en framtida wasm-kärna.

## Arkitektur

- `src/core/trackerEngine.ts` definierar det stabila engine-kontraktet.
- `src/core/wasmEngine.ts` är wasm-backenden som förväntar sig ett explicit adapter-API från C-kärnan.
- `src/core/mockEngine.ts` är fallback-backenden för UI- och kontraktsutveckling när wasm-adaptern ännu inte finns eller `emcc` saknas.
- `src/app.ts` innehåller den moderna keyboard-first UI:n för pattern editing, song settings och samplebank.

## Läget just nu

- TypeScript-appen använder nu ett strikt adapterlager i stället för att prata direkt med den gamla SDL-UI:n.
- UI:t kan köras och byggas utan wasm tack vare mock-backend.
- Wasm-backenden är definierad men väntar fortfarande på att C-kärnan exporterar det nya engine-adapter-API:t.
- Playback/parity är därför ännu inte flyttad till den nya hybrida UI:n.

## Kommandon

- `npm run dev`
  - startar UI:t i utvecklingsläge
- `npm run typecheck`
  - kör TypeScript-kontroll
- `npm run build:web`
  - bygger bara webbskalet
- `npm run build:wasm`
  - bygger wasm-kärnan via Emscripten
- `npm run build`
  - bygger först wasm och sedan webbskalet

## Förbereda upstream-kod

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-upstream.ps1
```

## Viktigt

Målet är feature parity med desktop-versionen, men den nya hybrida engine-adaptern är ännu inte komplett på C-sidan. Tills dess kör appen på mock-backend och ska betraktas som arkitektur- och UI-implementation, inte som färdig playback-port.
