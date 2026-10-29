// stands in for tauri-plugin-tts-api in the Electron edition. Electron has no separate system speech engine:
// the voices of Windows (and of speech-dispatcher on Linux) come through the web engine's speech instead
// (src/tts.ts lists them as "web-engine voices").
export interface Voice { id: string; name: string; language: string }
export async function getVoices(_language?: string): Promise<Voice[]> { return []; }
export async function isInitialized(): Promise<{ initialized: boolean; voiceCount: number }> { return { initialized: true, voiceCount: 0 }; }
export async function speak(_o: unknown): Promise<void> { throw new Error('no system speech engine in this edition'); }
export async function stop(): Promise<void> { /* nothing to stop */ }
export async function onSpeechEvent(_e: string, _h: (p: unknown) => void): Promise<() => void> { return () => {}; }
