'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Script from 'next/script';
import ThemeSelector from './ThemeSelector';
import styles from './Pomodoro.module.css';
import { getSettingAction, setSettingAction } from '@/app/actions/settings';

// ── Types ──
type Phase = 'setup' | 'posture-load' | 'posture-cam' | 'posture-correct' | 'posture-wrong' | 'focus' | 'complete' | 'break';
interface Settings { defaultDuration: number; sound: boolean; }

const PRESETS = [25, 45, 60];
const MIN_SAMPLES = 5;

function pad(n: number) { return n.toString().padStart(2, '0'); }

function playBeep(freq = 660, dur = 180) {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0.15, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + dur / 1000);
    } catch { }
}

function playComplete() { playBeep(880, 300); setTimeout(() => playBeep(1100, 400), 350); }

// Globals for TF
declare global {
    interface Window {
        tf: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        mobilenet: any; // eslint-disable-line @typescript-eslint/no-explicit-any
        knnClassifier: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    }
}

export default function Pomodoro() {
    const [phase, setPhase] = useState<Phase>('setup');
    const [settings, setSettings] = useState<Settings>({ defaultDuration: 25, sound: true });
    const [showSettings, setShowSettings] = useState(false);

    // Setup
    const [duration, setDuration] = useState(0);
    const [customDur, setCustomDur] = useState('');
    const [wantPosture, setWantPosture] = useState<boolean | null>(null);

    // Posture
    const [scriptsLoaded, setScriptsLoaded] = useState(0);
    const [modelLoaded, setModelLoaded] = useState(false);
    const [modelError, setModelError] = useState(false);
    const [camError, setCamError] = useState(false);
    const [correctSamples, setCorrectSamples] = useState(0);
    const [wrongSamples, setWrongSamples] = useState(0);
    const netRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
    const classifierRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Timer
    const [remaining, setRemaining] = useState(0);
    const [totalSecs, setTotalSecs] = useState(0);
    const [paused, setPaused] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Posture during focus
    const [postureOk, setPostureOk] = useState(true);
    const [postureActive, setPostureActive] = useState(false);
    const goodTicksRef = useRef(0);
    const totalTicksRef = useRef(0);
    const detectionRef = useRef(false);

    // Complete
    const [postureScore, setPostureScore] = useState(0);

    useEffect(() => {
        Promise.all([
            getSettingAction('pomodoro_duration'),
            getSettingAction('pomodoro_sound'),
        ]).then(([dur, snd]) => {
            const next: Settings = {
                defaultDuration: dur ? parseInt(dur) : 25,
                sound: snd !== 'false',
            };
            setSettings(next);
            setDuration(next.defaultDuration);
        });
    }, []);

    useEffect(() => { setDuration(settings.defaultDuration); }, [settings.defaultDuration]);

    function updateSettings(patch: Partial<Settings>) {
        const next = { ...settings, ...patch };
        setSettings(next);
        if (patch.defaultDuration !== undefined) setSettingAction('pomodoro_duration', String(patch.defaultDuration));
        if (patch.sound !== undefined) setSettingAction('pomodoro_sound', String(patch.sound));
    }

    // ── Cleanup ──
    const stopCam = useCallback(() => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
    }, []);

    useEffect(() => () => {
        stopCam();
        detectionRef.current = false;
        if (intervalRef.current) clearInterval(intervalRef.current);
    }, [stopCam]);

    // ── Tab title ──
    useEffect(() => {
        if (phase === 'focus' && !paused) {
            const m = Math.floor(remaining / 60), s = remaining % 60;
            document.title = `(${pad(m)}:${pad(s)}) Focus — dev-toolkit`;
        } else if (phase === 'break') {
            const m = Math.floor(remaining / 60), s = remaining % 60;
            document.title = `(${pad(m)}:${pad(s)}) Break — dev-toolkit`;
        } else {
            document.title = 'dev-toolkit — Pomodoro';
        }
    }, [phase, remaining, paused]);

    // ── Scripts counter ──
    function onScriptLoad() { setScriptsLoaded(p => p + 1); }

    // ── Attach stream to current video element ──
    useEffect(() => {
        const vid = videoRef.current;
        const stream = streamRef.current;
        if (vid && stream && vid.srcObject !== stream) {
            vid.srcObject = stream;
            vid.play().catch(() => { });
        }
    });

    // ── Load model ──
    useEffect(() => {
        if (phase !== 'posture-load' || scriptsLoaded < 3) return;
        let cancelled = false;
        (async () => {
            try {
                const net = await window.mobilenet.load();
                if (cancelled) return;
                netRef.current = net;
                classifierRef.current = window.knnClassifier.create();
                setModelLoaded(true);
                setPhase('posture-cam');
            } catch { if (!cancelled) setModelError(true); }
        })();
        return () => { cancelled = true; };
    }, [phase, scriptsLoaded]);

    // ── Webcam setup ──
    async function setupWebcam() {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = stream;
        setPhase('posture-correct');
        // Wait a tick for the new video element to mount, then attach
        await new Promise<void>(resolve => {
            setTimeout(() => {
                const vid = videoRef.current;
                if (vid) {
                    vid.srcObject = stream;
                    vid.addEventListener('loadeddata', () => resolve(), { once: true });
                    vid.play().catch(() => { });
                } else {
                    resolve();
                }
            }, 100);
        });
    }

    async function enableCam() {
        try {
            await setupWebcam();
        } catch {
            setCamError(true);
        }
    }

    // ── Capture correct posture — class 0 ──
    function captureCorrect() {
        if (!videoRef.current || !netRef.current || !classifierRef.current) return;
        const activation = netRef.current.infer(videoRef.current, 'conv_preds');
        classifierRef.current.addExample(activation, 0);
        setCorrectSamples(p => p + 1);
    }

    // ── Capture wrong posture — class 1 ──
    function captureWrong() {
        if (!videoRef.current || !netRef.current || !classifierRef.current) return;
        const activation = netRef.current.infer(videoRef.current, 'conv_preds');
        classifierRef.current.addExample(activation, 1);
        setWrongSamples(p => p + 1);
    }

    // ── Start focus ──
    function startFocus() {
        const secs = duration * 60;
        setRemaining(secs); setTotalSecs(secs); setPaused(false);
        goodTicksRef.current = 0; totalTicksRef.current = 0;
        setPostureOk(true); setPostureActive(wantPosture === true && modelLoaded);
        setPhase('focus');
        if (wantPosture && modelLoaded) startDetection();
    }

    function startFocusDirect() {
        const secs = duration * 60;
        setRemaining(secs); setTotalSecs(secs); setPaused(false);
        setPostureOk(true); setPostureActive(false);
        goodTicksRef.current = 0; totalTicksRef.current = 0;
        setPhase('focus');
    }

    // ── Timer ──
    useEffect(() => {
        if (phase !== 'focus' && phase !== 'break') return;
        if (paused) return;
        intervalRef.current = setInterval(() => {
            setRemaining(prev => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current!);
                    if (phase === 'focus') {
                        detectionRef.current = false;
                        stopCam();
                        if (settings.sound) playComplete();
                        const total = totalTicksRef.current;
                        setPostureScore(total > 0 ? Math.round((goodTicksRef.current / total) * 100) : 100);
                        setPhase('complete');
                    } else {
                        if (settings.sound) playComplete();
                        setPhase('setup');
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [phase, paused, settings.sound, stopCam]);

    // ── Detection loop — exact reference while loop ──
    function startDetection() {
        detectionRef.current = true;
        const classes = ['correct', 'wrong'];
        (async function loop() {
            while (detectionRef.current) {
                if (classifierRef.current && classifierRef.current.getNumClasses() > 0 && videoRef.current && netRef.current) {
                    try {
                        const activation = netRef.current.infer(videoRef.current, 'conv_preds');
                        const result = await classifierRef.current.predictClass(activation);
                        totalTicksRef.current++;
                        if (classes[result.classIndex] === 'wrong') {
                            setPostureOk(false);
                            if (settings.sound && totalTicksRef.current % 5 === 0) playBeep(440, 200);
                        } else {
                            goodTicksRef.current++;
                            setPostureOk(true);
                        }
                    } catch { }
                }
                if (window.tf) await window.tf.nextFrame();
                else await new Promise(r => setTimeout(r, 1000));
            }
        })();
    }

    // ── Pause / resume ──
    function togglePause() {
        setPaused(p => {
            if (!p) detectionRef.current = false;
            else if (postureActive) startDetection();
            return !p;
        });
    }

    // ── End session early ──
    function endSession() {
        if (intervalRef.current) clearInterval(intervalRef.current);
        detectionRef.current = false;
        stopCam();
        const total = totalTicksRef.current;
        setPostureScore(total > 0 ? Math.round((goodTicksRef.current / total) * 100) : 100);
        setPhase('complete');
    }

    // ── New session ──
    function newSession() {
        stopCam();
        detectionRef.current = false;
        setWantPosture(null); setCorrectSamples(0); setWrongSamples(0);
        setModelError(false); setCamError(false);
        setPhase('setup');
    }

    // ── Break ──
    function startBreak() {
        setRemaining(300); setTotalSecs(300); setPaused(false);
        setPostureActive(false);
        setPhase('break');
    }

    // ── Derived ──
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    const progress = totalSecs > 0 ? ((totalSecs - remaining) / totalSecs) * 100 : 0;

    let statusText = 'Idle';
    if (phase === 'setup' || phase.startsWith('posture')) statusText = 'Setup';
    else if (phase === 'focus') statusText = paused ? 'Paused' : `Focus ${pad(mins)}:${pad(secs)} remaining`;
    else if (phase === 'break') statusText = `Break ${pad(mins)}:${pad(secs)}`;
    else if (phase === 'complete') statusText = 'Session Complete';

    return (
        <div className={styles.wrapper}>
            {/* CDN Scripts */}
            <Script src="https://unpkg.com/@tensorflow/tfjs" strategy="lazyOnload" onLoad={onScriptLoad} />
            <Script src="https://unpkg.com/@tensorflow-models/mobilenet" strategy="lazyOnload" onLoad={onScriptLoad} />
            <Script src="https://unpkg.com/@tensorflow-models/knn-classifier" strategy="lazyOnload" onLoad={onScriptLoad} />

            {/* Toolbar */}
            <div className={styles.toolbar}>
                <span className={styles.toolbarLabel}>Pomodoro</span>
                <div className={styles.toolbarActions}>
                    <button className={styles.gearBtn} onClick={() => setShowSettings(s => !s)} title="Settings">⚙</button>
                    <ThemeSelector />
                </div>
            </div>

            {/* Settings */}
            {showSettings && (
                <div className={styles.settingsPanel}>
                    <div className={styles.settingsRow}>
                        <span>Default focus (min)</span>
                        <input type="number" min={1} max={180} className={styles.settingsInput}
                            value={settings.defaultDuration} onChange={e => updateSettings({ defaultDuration: Math.max(1, Number(e.target.value)) })} />
                    </div>
                    <div className={styles.settingsRow}>
                        <span>Sound</span>
                        <button className={`${styles.toggleBtn} ${settings.sound ? styles.toggleOn : ''}`}
                            onClick={() => updateSettings({ sound: !settings.sound })}>
                            {settings.sound ? 'On' : 'Off'}
                        </button>
                    </div>
                </div>
            )}

            <div className={styles.content}>

                {/* ── SETUP ── */}
                {phase === 'setup' && (
                    <div className={styles.setupBox}>
                        <p className={styles.setupQ}>How long do you want to focus?</p>
                        <div className={styles.presetRow}>
                            {PRESETS.map(p => (
                                <button key={p} className={`${styles.presetBtn} ${duration === p && !customDur ? styles.presetActive : ''}`}
                                    onClick={() => { setDuration(p); setCustomDur(''); }}>
                                    {p} min
                                </button>
                            ))}
                            <button className={`${styles.presetBtn} ${customDur ? styles.presetActive : ''}`}
                                onClick={() => setCustomDur(String(duration))}>
                                Custom
                            </button>
                        </div>
                        {customDur !== '' && (
                            <input type="number" min={1} max={180} className={styles.customInput}
                                value={customDur} onChange={e => { setCustomDur(e.target.value); setDuration(Math.max(1, Number(e.target.value))); }}
                                placeholder="Minutes" autoFocus />
                        )}

                        {duration > 0 && (
                            <>
                                <p className={`${styles.setupQ} ${styles.setupQ2}`}>Do you want posture monitoring?</p>
                                <div className={styles.postureRow}>
                                    <button className={`${styles.postureBtn} ${styles.postureBtnYes}`}
                                        onClick={() => { setWantPosture(true); setPhase('posture-load'); }}>
                                        Yes, monitor my posture
                                    </button>
                                    <button className={`${styles.postureBtn} ${styles.postureBtnNo}`}
                                        onClick={() => { setWantPosture(false); startFocusDirect(); }}>
                                        No thanks, just the timer
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── POSTURE LOAD ── */}
                {phase === 'posture-load' && (
                    <div className={styles.centerBox}>
                        {!modelError ? (
                            <>
                                <div className={styles.spinner} />
                                <p className={styles.loadingText}>Loading posture detection model…</p>
                                <p className={styles.loadingSub}>{scriptsLoaded < 3 ? `Loading scripts (${scriptsLoaded}/3)…` : 'Initializing MobileNet…'}</p>
                            </>
                        ) : (
                            <>
                                <p className={styles.errorText}>Could not load model.</p>
                                <div className={styles.btnRow}>
                                    <button className={styles.actionBtn} onClick={() => { setModelError(false); setPhase('posture-load'); }}>Try Again</button>
                                    <button className={styles.actionBtn} onClick={() => { setWantPosture(false); startFocusDirect(); }}>Skip Monitoring</button>
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ── POSTURE CAM ── */}
                {phase === 'posture-cam' && (
                    <div className={styles.centerBox}>
                        {!camError ? (
                            <>
                                <p className={styles.setupQ}>We need webcam access to monitor posture.</p>
                                <button className={styles.accentBtn} onClick={enableCam}>Enable Webcam</button>
                            </>
                        ) : (
                            <>
                                <p className={styles.errorText}>Webcam access denied.</p>
                                <button className={styles.actionBtn} onClick={() => { setWantPosture(false); startFocusDirect(); }}>Skip Monitoring</button>
                            </>
                        )}
                    </div>
                )}

                {/* ── TRAIN CORRECT POSTURE ── */}
                {phase === 'posture-correct' && (
                    <div className={styles.centerBox}>
                        <p className={styles.setupQ}>Sit in your <strong>correct</strong> posture and click below.</p>
                        <div className={styles.videoWrap}>
                            <video ref={videoRef} className={styles.video} autoPlay playsInline muted />
                        </div>
                        <button className={styles.captureBtn} onClick={captureCorrect}>Capture Correct Posture</button>
                        <div className={styles.sampleInfo}>
                            <span>Correct samples: {correctSamples}</span>
                            <div className={styles.sampleBar}><div className={styles.sampleFill} style={{ width: `${Math.min(100, (correctSamples / MIN_SAMPLES) * 100)}%` }} /></div>
                            <span className={styles.sampleHint}>{correctSamples < MIN_SAMPLES ? `${MIN_SAMPLES - correctSamples} more recommended` : '✓ Ready'}</span>
                        </div>
                        {correctSamples >= MIN_SAMPLES && (
                            <button className={styles.accentBtn} onClick={() => setPhase('posture-wrong')}>Next: Train Wrong Posture →</button>
                        )}
                    </div>
                )}

                {/* ── TRAIN WRONG POSTURE ── */}
                {phase === 'posture-wrong' && (
                    <div className={styles.centerBox}>
                        <p className={styles.setupQ}>Now sit in a <strong>wrong</strong> posture and click below.</p>
                        <div className={styles.videoWrap}>
                            <video ref={videoRef} className={styles.video} autoPlay playsInline muted />
                        </div>
                        <button className={styles.captureBtnRed} onClick={captureWrong}>Capture Wrong Posture</button>
                        <div className={styles.sampleInfo}>
                            <span>Wrong samples: {wrongSamples}</span>
                            <div className={styles.sampleBarRed}><div className={styles.sampleFillRed} style={{ width: `${Math.min(100, (wrongSamples / MIN_SAMPLES) * 100)}%` }} /></div>
                            <span className={styles.sampleHint}>{wrongSamples < MIN_SAMPLES ? `${MIN_SAMPLES - wrongSamples} more recommended` : '✓ Ready'}</span>
                        </div>
                        {wrongSamples >= MIN_SAMPLES && (
                            <button className={styles.accentBtn} onClick={startFocus}>Start Session</button>
                        )}
                    </div>
                )}

                {/* ── FOCUS TIMER ── */}
                {phase === 'focus' && (
                    <div className={styles.timerBox}>
                        {postureActive && <video ref={videoRef} className={styles.hiddenVideo} autoPlay playsInline muted />}

                        {postureActive && (
                            <div className={`${styles.posturePill} ${paused ? styles.pillGrey : postureOk ? styles.pillGreen : styles.pillRed}`}>
                                <span className={styles.pillDot} />
                                {paused ? 'Paused' : postureOk ? 'Posture OK' : 'Bad Posture'}
                            </div>
                        )}

                        <div className={styles.countdown}>{pad(mins)}:{pad(secs)}</div>
                        <p className={styles.durLabel}>{duration} min session</p>
                        <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
                        <div className={styles.timerBtns}>
                            <button className={styles.actionBtn} onClick={togglePause}>{paused ? '▶ Resume' : '❚❚ Pause'}</button>
                            <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={endSession}>✕ End Session</button>
                        </div>
                    </div>
                )}

                {/* ── BREAK ── */}
                {phase === 'break' && (
                    <div className={styles.timerBox}>
                        <p className={styles.breakLabel}>Break</p>
                        <div className={styles.countdown}>{pad(mins)}:{pad(secs)}</div>
                        <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${progress}%` }} /></div>
                        <button className={styles.actionBtn} onClick={newSession}>Skip Break</button>
                    </div>
                )}

                {/* ── COMPLETE ── */}
                {phase === 'complete' && (
                    <div className={styles.centerBox}>
                        <p className={styles.completeTitle}>Session Complete!</p>
                        <p className={styles.completeSub}>{duration} min focus session</p>
                        {postureActive && (
                            <div className={styles.scoreBox}>
                                <span className={styles.scoreLabel}>Posture Score</span>
                                <span className={styles.scoreValue}>{postureScore}%</span>
                                <span className={styles.scoreHint}>of session in correct posture</span>
                            </div>
                        )}
                        <div className={styles.btnRow}>
                            <button className={styles.accentBtn} onClick={newSession}>Start New Session</button>
                            <button className={styles.actionBtn} onClick={startBreak}>Take a Break (5 min)</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Status bar */}
            <div className={styles.statusBar}>
                <span className={styles.statusItem}>{statusText}</span>
                {phase === 'focus' && postureActive && !paused && (
                    <>
                        <span className={styles.statusDivider}>|</span>
                        <span className={postureOk ? styles.statusGreen : styles.statusRed}>
                            {postureOk ? '● Posture OK' : '● Bad Posture'}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}
