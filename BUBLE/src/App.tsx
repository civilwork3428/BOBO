/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Umbrella, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MoveHorizontal, RefreshCcw, Volume2, VolumeX } from 'lucide-react';

// --- Sound Engine ---
class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private isMuted: boolean = false;

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      
      // Setup Wind Noise (Ambient)
      const bufferSize = 2 * this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;

      whiteNoise.connect(filter);
      filter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      whiteNoise.start();
    } catch (e) {
      console.error('Audio initialization failed', e);
    }
  }

  setMute(mute: boolean) {
    this.isMuted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 1, this.ctx.currentTime, 0.1);
    }
  }

  updateWind(speed: number) {
    if (!this.windGain || !this.ctx) return;
    const volume = Math.min(0.15, speed / 80);
    this.windGain.gain.setTargetAtTime(this.isMuted ? 0 : volume, this.ctx.currentTime, 0.1);
  }

  playSwitch() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);
    g.gain.setValueAtTime(0.1, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playAiyaya() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    
    // "Ai" - High and quick
    const playNote = (freq: number, start: number, duration: number, vol: number) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.8, start + duration);
      
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vol, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.01, start + duration);
      
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + duration);
    };

    // Ai (High)
    playNote(600, now, 0.15, 0.2);
    // Ya (Mid)
    playNote(400, now + 0.15, 0.15, 0.15);
    // Ya (Low)
    playNote(300, now + 0.3, 0.2, 0.1);
  }

  playWin() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    [440, 554, 659, 880].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.frequency.setValueAtTime(freq, now + i * 0.1);
      g.gain.setValueAtTime(0, now + i * 0.1);
      g.gain.linearRampToValueAtTime(0.1, now + i * 0.1 + 0.05);
      g.gain.linearRampToValueAtTime(0, now + i * 0.1 + 0.3);
      osc.connect(g);
      g.connect(this.masterGain!);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.4);
    });
  }
}

const audio = new SoundEngine();

// Constants
const GAME_WIDTH = 400;
const GAME_HEIGHT = 700;
const WORLD_HEIGHT = 10000;
const BUBBLE_COUNT = 240;
const PLAYER_SIZE = 40;
const BUBBLE_SIZE = 40;

const GRAVITY = 0.15;
const UMBRELLA_DRAG = 0.05;
const DROP_ACCEL = 0.4;
const HORIZONTAL_SPEED = 5;
const MAX_FALL_SPEED = 8;
const MIN_FALL_SPEED = 1.5;

type ColorMode = 'RED' | 'BLUE';

interface Bubble {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  type: 'WARM' | 'COOL';
  isBurst?: boolean;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
}

const translations = {
// ... existing translations
  EN: {
    title: "BUBBLE DESCENT",
    subtitle: "Match color to pass safely",
    ready: "READY TO DROP?",
    umbrella: "HOLD FOR UMBRELLA",
    fastFall: "HOLD TO FAST FALL",
    switchColor: "SPACE TO SWITCH COLOR",
    start: "START DESCENT",
    crashed: "CRASHED!",
    turbulence: "Mismatching colors causes a 500m bounce penalty!",
    tryAgain: "TRY AGAIN",
    landed: "LANDED!",
    safe: "Safe delivery to the ground.",
    playAgain: "PLAY AGAIN",
    finish: "FINISH LINE",
    mode: "MODE",
    alt: "ALT"
  },
  ZH: {
    title: "泡泡降落",
    subtitle: "對應顏色即可安全通過",
    ready: "準備好降落了嗎？",
    umbrella: "長按上鍵：撐傘緩降",
    fastFall: "長按下鍵：收傘下落",
    switchColor: "空格鍵：切換紅藍模式",
    start: "開始降落",
    crashed: "墜毀！",
    turbulence: "顏色不匹配會導致向上彈回 500 點作為懲罰！",
    tryAgain: "再試一次",
    landed: "成功著陸！",
    safe: "安全抵達地面。",
    playAgain: "重玩一次",
    finish: "終點線",
    mode: "模式",
    alt: "高度",
    time: "時間",
    bestTime: "最佳紀錄"
  }
};

export default function App() {
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'GAMEOVER' | 'WIN'>('START');
  const [playerY, setPlayerY] = useState(100);
  const [playerX, setPlayerX] = useState(GAME_WIDTH / 2);
  const [playerVelocityY, setPlayerVelocityY] = useState(0);
  const [umbrellaOpen, setUmbrellaOpen] = useState(true);
  const [colorMode, setColorMode] = useState<ColorMode>('RED');
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [distance, setDistance] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [lang, setLang] = useState<'EN' | 'ZH'>('ZH');
  const [shake, setShake] = useState(0);
  const [lastCollisionTime, setLastCollisionTime] = useState(0);
  const [isFlashing, setIsFlashing] = useState<ColorMode | null>(null);
  const [ripples, setRipples] = useState<{ id: number, x: number; y: number }[]>([]);
  const activePointers = useRef(new Set());
  
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [bestTime, setBestTime] = useState<number | null>(() => {
    const saved = localStorage.getItem('bubble-descent-best');
    return saved ? parseFloat(saved) : null;
  });
  
  const t = translations[lang];
  
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(null);
  const keysPressed = useRef<{ [key: string]: boolean }>({});

  const initGame = useCallback(() => {
    audio.init();
    const newBubbles: Bubble[] = [];
    const warmColors = ['#ef4444', '#f59e0b', '#fbbf24', '#f87171']; // Reds and Yellows
    const coolColors = ['#3b82f6', '#10b981', '#2dd4bf', '#60a5fa']; // Blues and Greens

    const MIN_DISTANCE = BUBBLE_SIZE + 20;
    let attempts = 0;
    
    while (newBubbles.length < BUBBLE_COUNT && attempts < 20000) {
      attempts++;
      const x = Math.random() * (GAME_WIDTH - BUBBLE_SIZE);
      const y = 500 + Math.random() * (WORLD_HEIGHT - 800);
      
      const isOverlap = newBubbles.some(b => {
        const dx = (x + BUBBLE_SIZE / 2) - (b.x + BUBBLE_SIZE / 2);
        const dy = (y + BUBBLE_SIZE / 2) - (b.y + BUBBLE_SIZE / 2);
        return Math.sqrt(dx * dx + dy * dy) < MIN_DISTANCE;
      });

      if (!isOverlap) {
        const type = Math.random() > 0.5 ? 'WARM' : 'COOL';
        newBubbles.push({
          id: newBubbles.length,
          x,
          y,
          size: BUBBLE_SIZE,
          type,
          color: type === 'WARM' 
            ? warmColors[Math.floor(Math.random() * warmColors.length)]
            : coolColors[Math.floor(Math.random() * coolColors.length)],
        });
      }
    }
    setBubbles(newBubbles);
    setParticles([]);
    setPlayerY(100);
    setPlayerX(GAME_WIDTH / 2);
    setPlayerVelocityY(0);
    setUmbrellaOpen(true);
    setColorMode('RED');
    setDistance(0);
    setStartTime(Date.now());
    setElapsedTime(0);
    setGameState('PLAYING');
  }, []);

  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const createBurst = (x: number, y: number, color: string) => {
    const burst: Particle[] = [];
    for (let i = 0; i < 15; i++) {
      burst.push({
        id: Math.random(),
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        size: Math.random() * 8 + 4,
        color,
        life: 1.0
      });
    }
    setParticles(prev => [...prev, ...burst]);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
// ... existing handleKeyDown
    keysPressed.current[e.key] = true;
    
    // Prevent scrolling with space/arrows
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }

    if (e.key === ' ' && gameStateRef.current === 'PLAYING') {
      switchColor();
    }
  };

  const switchColor = useCallback(() => {
    setColorMode(prev => {
      const next = prev === 'RED' ? 'BLUE' : 'RED';
      audio.playSwitch();
      setIsFlashing(next);
      setTimeout(() => setIsFlashing(null), 200);
      return next;
    });
  }, []);

  const handleKeyUp = (e: KeyboardEvent) => {
    keysPressed.current[e.key] = false;
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const update = useCallback(() => {
    if (gameState !== 'PLAYING') {
      audio.updateWind(0);
      return;
    }

    setPlayerVelocityY(v => {
      let newV = v;
      
      // Control with Up/Down
      if (keysPressed.current['ArrowUp']) {
        setUmbrellaOpen(true);
        newV += GRAVITY - UMBRELLA_DRAG * 2;
      } else if (keysPressed.current['ArrowDown']) {
        setUmbrellaOpen(false);
        newV += GRAVITY + DROP_ACCEL;
      } else {
        // Neutral
        newV += GRAVITY;
      }

      // Clamp speed based on umbrella state
      const currentMax = umbrellaOpen ? MIN_FALL_SPEED : MAX_FALL_SPEED;
      if (newV > currentMax) newV = currentMax;
      if (newV < 0) newV = 0;
      
      return newV;
    });

    setPlayerX(x => {
      let newX = x;
      if (keysPressed.current['ArrowLeft']) newX -= HORIZONTAL_SPEED;
      if (keysPressed.current['ArrowRight']) newX += HORIZONTAL_SPEED;
      
      // Screen wrapping logic: if the player goes off one side, they appear on the other
      if (newX < -PLAYER_SIZE) newX = GAME_WIDTH;
      if (newX > GAME_WIDTH) newX = -PLAYER_SIZE;
      
      return newX;
    });

    setDistance(d => d + playerVelocityY);
    audio.updateWind(playerVelocityY * 10);
    
    // Update Timer
    if (startTime) {
      setElapsedTime((Date.now() - startTime) / 1000);
    }

    // Update Particles
    setParticles(prev => prev
      .map(p => ({
        ...p,
        x: p.x + p.vx,
        y: p.y + p.vy,
        vy: p.vy + 0.2, // gravity for particles
        life: p.life - 0.02
      }))
      .filter(p => p.life > 0)
    );

    // Collision Detection
    const playerWorldY = distance + playerY + PLAYER_SIZE / 2;
    const playerCenterX = playerX + PLAYER_SIZE / 2;

    const checkCollision = (px: number) => {
      for (const bubble of bubbles) {
        if (bubble.isBurst) continue;

        // Check collision against current bubble AND its ghost if it were wrapped
        // But simpler: just check player against bubble, and player ghosts
        const dx = px - (bubble.x + bubble.size / 2);
        const dy = (distance + playerY + PLAYER_SIZE / 2) - (bubble.y + bubble.size / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < (PLAYER_SIZE / 3 + bubble.size / 2)) {
          const isCompatible = (colorMode === 'RED' && bubble.type === 'WARM') || 
                               (colorMode === 'BLUE' && bubble.type === 'COOL');
          
          if (!isCompatible) {
            audio.playAiyaya();
            setBubbles(prev => prev.map(b => b.id === bubble.id ? { ...b, isBurst: true } : b));
            createBurst(bubble.x + bubble.size / 2, bubble.y, bubble.color);
            
            setShake(8);
            setDistance(prev => Math.max(0, prev - 500));
            setPlayerVelocityY(0);
            setLastCollisionTime(Date.now());
            return true;
          }
        }
      }
      return false;
    };

    // Check three possible positions for the player due to wrap-around
    if (checkCollision(playerCenterX) || 
        checkCollision(playerCenterX + GAME_WIDTH) || 
        checkCollision(playerCenterX - GAME_WIDTH)) {
      // Collision handled inside checkCollision
    }

    if (distance >= WORLD_HEIGHT - playerY - 80) {
      audio.playWin();
      const finalTime = (Date.now() - (startTime || Date.now())) / 1000;
      setElapsedTime(finalTime);
      if (bestTime === null || finalTime < bestTime) {
        setBestTime(finalTime);
        localStorage.setItem('bubble-descent-best', finalTime.toString());
      }
      setGameState('WIN');
      return;
    }

    // Decay shake
    if (shake > 0) setShake(s => Math.max(0, s - 0.5));

    requestRef.current = requestAnimationFrame(update);
  }, [gameState, distance, playerY, playerX, playerVelocityY, umbrellaOpen, colorMode, bubbles]);

  useEffect(() => {
    if (gameState === 'PLAYING') {
      requestRef.current = requestAnimationFrame(update);
    } else if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, update]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans text-slate-100 overflow-hidden">
      <div className="mb-4 text-center relative w-full max-w-[400px]">
        <h1 className="text-3xl font-bold tracking-tighter mb-1 uppercase tracking-widest">{t.title}</h1>
        <p className="text-slate-400 text-xs">{t.subtitle}</p>
        
        {/* Language Toggle */}
        <button 
          onClick={() => setLang(l => l === 'EN' ? 'ZH' : 'EN')}
          className="absolute right-0 top-0 bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-[10px] font-bold"
        >
          {lang === 'EN' ? '中文' : 'EN'}
        </button>
      </div>

      <div 
        ref={containerRef}
        className="relative bg-[#1a1c2c] border-8 border-[#2f3542] rounded-3xl shadow-2xl overflow-hidden touch-none"
        style={{ 
          width: GAME_WIDTH, 
          height: GAME_HEIGHT,
          transform: shake > 0 ? `translate(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.5) * shake}px)` : 'none',
          boxShadow: isFlashing 
            ? `0 0 40px ${isFlashing === 'RED' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.4)'} inset, 0 0 20px rgba(0,0,0,0.5)`
            : '0 10px 50px rgba(0,0,0,0.5)'
        }}
        onPointerDown={(e) => {
          if (gameStateRef.current !== 'PLAYING') return;
          
          activePointers.current.add(e.pointerId);
          // If using more than 1 finger, close umbrella for speed (Pro Mode)
          if (activePointers.current.size > 1) {
            setUmbrellaOpen(false);
          } else {
            setUmbrellaOpen(true);
          }

          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) {
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            setRipples(prev => [...prev.slice(-3), { id: Date.now(), x, y }]);
            setTimeout(() => setRipples(prev => prev.slice(1)), 600);

            if (y < GAME_HEIGHT * 0.7) {
              switchColor();
            } else {
              if (x < GAME_WIDTH / 2) {
                keysPressed.current['ArrowLeft'] = true;
                keysPressed.current['ArrowRight'] = false;
              } else {
                keysPressed.current['ArrowRight'] = true;
                keysPressed.current['ArrowLeft'] = false;
              }
            }
          }
        }}
        onPointerMove={(e) => {
          if (gameStateRef.current !== 'PLAYING') return;
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect && e.buttons > 0) {
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (y >= GAME_HEIGHT * 0.7) {
              if (x < GAME_WIDTH / 2) {
                keysPressed.current['ArrowLeft'] = true;
                keysPressed.current['ArrowRight'] = false;
              } else {
                keysPressed.current['ArrowRight'] = true;
                keysPressed.current['ArrowLeft'] = false;
              }
            }
          }
        }}
        onPointerUp={(e) => {
          activePointers.current.delete(e.pointerId);
          if (activePointers.current.size <= 1) {
            setUmbrellaOpen(true);
          }
          keysPressed.current['ArrowLeft'] = false;
          keysPressed.current['ArrowRight'] = false;
        }}
        onPointerLeave={(e) => {
          activePointers.current.delete(e.pointerId);
          setUmbrellaOpen(true);
          keysPressed.current['ArrowLeft'] = false;
          keysPressed.current['ArrowRight'] = false;
        }}
      >
        {/* Mobile Controls Overlay */}
        <div className="absolute inset-x-0 bottom-10 z-40 flex justify-between px-6 pointer-events-none sm:hidden">
          <div className="flex gap-4 pointer-events-auto">
            <button 
              onPointerDown={() => keysPressed.current['ArrowUp'] = true}
              onPointerUp={() => keysPressed.current['ArrowUp'] = false}
              className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 active:scale-90 transition-transform"
            >
              <Umbrella className="w-6 h-6" />
            </button>
            <button 
              onPointerDown={() => keysPressed.current['ArrowDown'] = true}
              onPointerUp={() => keysPressed.current['ArrowDown'] = false}
              className="w-14 h-14 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 active:scale-90 transition-transform"
            >
              <ChevronDown className="w-6 h-6" />
            </button>
          </div>
          <button 
            onClick={() => setColorMode(prev => {
              const next = prev === 'RED' ? 'BLUE' : 'RED';
              audio.playSwitch();
              return next;
            })}
            className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/40 active:scale-90 transition-transform pointer-events-auto"
          >
            <RefreshCcw className="w-6 h-6" />
          </button>
        </div>

        {/* Background Clouds/Motion */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ 
            backgroundImage: `radial-gradient(circle at 50% 50%, #ffffff 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            transform: `translateY(${-distance % 40}px)`
          }}
        />

        {/* Distance Indicator - Repositioned to corners for a cleaner HUD */}
        <div className="absolute top-4 left-6 z-40 flex items-center gap-2 pointer-events-none">
           <div className="flex flex-col">
             <span className="text-[10px] font-black uppercase tracking-widest text-[#4b5563]">Alt</span>
             <span className="text-lg font-black text-white tabular-nums leading-none">
               {Math.max(0, Math.floor(WORLD_HEIGHT - distance - playerY - 80))}m
             </span>
           </div>
        </div>

        <div className="absolute top-4 right-6 z-40 flex items-center gap-2 text-right pointer-events-none">
           <div className="flex flex-col">
             <span className="text-[10px] font-black uppercase tracking-widest text-orange-500/60">Time</span>
             <span className="text-lg font-black text-orange-400 tabular-nums leading-none">
               {elapsedTime.toFixed(1)}s
             </span>
           </div>
        </div>

        {/* Click Feedback Ripples */}
        {ripples.map(r => (
          <motion.div
            key={r.id}
            initial={{ scale: 0.5, opacity: 0.5 }}
            animate={{ scale: 2, opacity: 0 }}
            className="absolute w-12 h-12 bg-white/30 rounded-full z-50 pointer-events-none"
            style={{ left: r.x - 24, top: r.y - 24 }}
          />
        ))}

        {/* Bubbles */}
        <div className="absolute inset-0 z-0">
          {bubbles.map(bubble => {
            const screenY = bubble.y - distance;
            if (screenY < -100 || screenY > GAME_HEIGHT + 100 || bubble.isBurst) return null;
            
            const isFriendly = (colorMode === 'RED' && bubble.type === 'WARM') || 
                               (colorMode === 'BLUE' && bubble.type === 'COOL');
            
            const renderBubble = (offX: number) => (
              <motion.div
                key={`${bubble.id}-${offX}`}
                animate={{ 
                  y: [0, -6, 0],
                  scale: isFriendly ? [1.2, 1.3, 1.2] : [0.9, 0.95, 0.9],
                }}
                transition={{ 
                  duration: 2 + Math.random(), 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
                className="absolute z-10"
                style={{
                  left: bubble.x + offX,
                  top: screenY,
                  width: bubble.size,
                  height: bubble.size,
                }}
              >
                <svg viewBox="0 0 32 32" className="w-full h-full">
                  {/* Outer Border (Pixelated) */}
                  <rect x="8" y="0" width="16" height="4" fill="#2f3542" />
                  <rect x="8" y="28" width="16" height="4" fill="#2f3542" />
                  <rect x="0" y="8" width="4" height="16" fill="#2f3542" />
                  <rect x="28" y="8" width="4" height="16" fill="#2f3542" />
                  <rect x="4" y="4" width="4" height="4" fill="#2f3542" />
                  <rect x="24" y="4" width="4" height="4" fill="#2f3542" />
                  <rect x="4" y="24" width="4" height="4" fill="#2f3542" />
                  <rect x="24" y="24" width="4" height="4" fill="#2f3542" />

                  {/* Main Body */}
                  <rect x="8" y="4" width="16" height="24" fill={bubble.color} />
                  <rect x="4" y="8" width="24" height="16" fill={bubble.color} />

                  {/* Matte Highlight */}
                  <rect x="8" y="8" width="4" height="4" fill="rgba(255,255,255,0.2)" />
                  <rect x="12" y="8" width="4" height="2" fill="rgba(255,255,255,0.5)" />
                  <rect x="8" y="12" width="2" height="4" fill="rgba(255,255,255,0.5)" />

                  {/* Core Decoration */}
                  <rect x="12" y="12" width="8" height="8" fill="rgba(0,0,0,0.1)" />
                </svg>
              </motion.div>
            );

            return (
              <React.Fragment key={bubble.id}>
                {renderBubble(0)}
                {bubble.x > GAME_WIDTH - BUBBLE_SIZE && renderBubble(-GAME_WIDTH)}
                {bubble.x < BUBBLE_SIZE && renderBubble(GAME_WIDTH)}
              </React.Fragment>
            );
          })}
        </div>

        {/* Particles */}
        <div className="absolute inset-0 z-5 pointer-events-none">
          {particles.map(p => (
            <div
              key={p.id}
              className="absolute border border-black/20"
              style={{
                left: p.x,
                top: p.y - distance,
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                opacity: p.life,
                transform: `rotate(${p.id * 360}deg) scale(${p.life})`
              }}
            />
          ))}
        </div>

        {/* Ground */}
        <div 
          className="absolute left-0 w-full h-[500px] bg-slate-800 border-t-8 border-emerald-900/50 z-10"
          style={{ 
            top: WORLD_HEIGHT - distance
          }}
        >
          <div className="p-8 text-center">
            <div className="text-2xl font-black text-emerald-400 italic">{t.finish}</div>
          </div>
        </div>

        {/* Player Stickman */}
        <motion.div
          className="absolute z-30 pointer-events-none"
          style={{ left: playerX, top: playerY }}
          animate={{ 
            rotate: (keysPressed.current['ArrowLeft'] ? -15 : 0) + (keysPressed.current['ArrowRight'] ? 15 : 0),
            scaleY: 1 - Math.min(0.2, playerVelocityY / 20),
            scaleX: 1 + Math.min(0.2, playerVelocityY / 20)
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <PixelHero colorMode={colorMode} umbrellaOpen={umbrellaOpen} />
        </motion.div>

        {/* Player Ghosts for wrapping */}
        <motion.div
          className="absolute z-30 pointer-events-none"
          style={{ left: playerX + GAME_WIDTH, top: playerY }}
          animate={{ 
            rotate: (keysPressed.current['ArrowLeft'] ? -15 : 0) + (keysPressed.current['ArrowRight'] ? 15 : 0),
            scaleY: 1 - Math.min(0.2, playerVelocityY / 20),
            scaleX: 1 + Math.min(0.2, playerVelocityY / 20)
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <PixelHero colorMode={colorMode} umbrellaOpen={umbrellaOpen} />
        </motion.div>
        <motion.div
          className="absolute z-30 pointer-events-none"
          style={{ left: playerX - GAME_WIDTH, top: playerY }}
          animate={{ 
            rotate: (keysPressed.current['ArrowLeft'] ? -15 : 0) + (keysPressed.current['ArrowRight'] ? 15 : 0),
            scaleY: 1 - Math.min(0.2, playerVelocityY / 20),
            scaleX: 1 + Math.min(0.2, playerVelocityY / 20)
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <PixelHero colorMode={colorMode} umbrellaOpen={umbrellaOpen} />
        </motion.div>

        {/* Overlays */}
        <AnimatePresence>
          {gameState === 'START' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="absolute inset-0 bg-[#1a1c2c]/80 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="bg-[#2f3542]/90 backdrop-blur-xl rounded-[40px] p-8 max-w-sm w-full text-center shadow-2xl border-t-8 border-blue-500/50">
                <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-20 h-20 bg-blue-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner border border-blue-400/20"
                >
                  <Umbrella className="w-12 h-12 text-blue-400" />
                </motion.div>
                
                <h2 className="text-4xl font-black text-slate-100 mb-6 uppercase tracking-tighter leading-none">{t.ready}</h2>
                
                {/* Logic Tutorial Segment */}
                <div className="mb-6 flex flex-col items-center bg-black/20 p-4 rounded-3xl border border-white/5">
                  <div className="flex items-center justify-center gap-4 mb-2">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 bg-red-500/30 rounded-lg border border-red-400/30 flex items-center justify-center mb-1">
                        <div className="w-4 h-4 bg-red-500 rounded-sm" />
                      </div>
                      <span className="text-[10px] text-red-400 font-bold">RED</span>
                    </div>
                    <div className="text-slate-500 font-black">=</div>
                    <div className="bg-white/5 px-3 py-1 rounded-full text-[10px] text-slate-300 font-black uppercase tracking-widest">
                      Safe Pass
                    </div>
                    <div className="text-slate-500 font-black">=</div>
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 bg-blue-500/30 rounded-lg border border-blue-400/30 flex items-center justify-center mb-1">
                        <div className="w-4 h-4 bg-blue-500 rounded-sm" />
                      </div>
                      <span className="text-[10px] text-blue-400 font-bold">BLUE</span>
                    </div>
                  </div>
                  <div className="text-[9px] text-indigo-400 font-black uppercase tracking-widest bg-indigo-500/10 px-4 py-2 rounded-xl border border-indigo-400/20">
                    放手即開傘：安全防摔模式
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold mt-2">
                    ( 雙指按住加速，放開一指即恢復開傘 )
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-8">
                  <div className="bg-black/20 p-3 rounded-2xl border border-white/5 active:bg-white/5 transition-colors">
                    <div className="flex justify-center gap-1 mb-2">
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                      <ChevronLeft className="w-4 h-4 text-slate-400" />
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="text-[9px] text-slate-400 font-black uppercase leading-tight">{t.umbrella}<br/>& Move</div>
                  </div>
                  <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
                    <div className="w-10 h-5 bg-white/10 rounded mx-auto mb-2 flex items-center justify-center text-[8px] font-black text-slate-400 border border-white/10">SPACE</div>
                    <div className="text-[9px] text-slate-400 font-black uppercase leading-tight">{t.switchColor}</div>
                  </div>
                </div>

                <button 
                  onClick={initGame}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-3xl font-black transition-all transform active:scale-95 shadow-xl text-xl"
                >
                  {t.start}
                </button>
              </div>
              
              <div className="mt-8 flex gap-4 text-white/30 uppercase text-[10px] font-black tracking-widest">
                 <button onClick={() => { setIsMuted(!isMuted); audio.setMute(!isMuted); }} className="hover:text-white">
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                 </button>
              </div>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="absolute inset-0 bg-red-950/60 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="bg-[#2f3542]/95 backdrop-blur-xl rounded-[40px] p-8 max-w-sm w-full text-center shadow-2xl border-t-8 border-red-500/50">
                <div className="text-6xl mb-4">💥</div>
                <h2 className="text-4xl font-black text-slate-100 mb-2 uppercase tracking-tighter">{t.crashed}</h2>
                <p className="text-red-400 text-xs font-bold mb-8 uppercase tracking-wider">{t.turbulence}</p>
                <button 
                  onClick={initGame}
                  className="w-full bg-red-600 hover:bg-red-500 text-white py-5 rounded-3xl font-black transition-all active:scale-95 shadow-xl flex items-center justify-center gap-3 text-xl"
                >
                  <RefreshCcw className="w-6 h-6" /> {t.tryAgain}
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'WIN' && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="absolute inset-0 bg-emerald-950/60 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="bg-[#2f3542]/95 backdrop-blur-xl rounded-[40px] p-8 max-w-sm w-full text-center shadow-2xl border-t-8 border-emerald-500/50">
                <div className="text-6xl mb-4">✨</div>
                <h2 className="text-4xl font-black text-slate-100 mb-2 uppercase tracking-tighter">{t.landed}</h2>
                
                <div className="bg-black/20 rounded-2xl p-6 mb-8 border border-white/5">
                  <div className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-1">{t.time}</div>
                  <div className="text-5xl font-black text-emerald-400 leading-none">{elapsedTime.toFixed(2)}s</div>
                  {bestTime && <div className="mt-2 text-[10px] text-emerald-500/50 font-bold uppercase tracking-widest">Personal Best: {bestTime.toFixed(2)}s</div>}
                </div>

                <p className="text-emerald-500/70 text-[10px] font-black uppercase tracking-widest mb-8">{t.safe}</p>
                
                <button 
                  onClick={initGame}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-5 rounded-3xl font-black transition-all active:scale-95 shadow-xl text-xl"
                >
                  {t.playAgain}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-6 flex gap-6 text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-xs">Red Mode</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-xs">Blue Mode</span>
        </div>
      </div>
    </div>
  );
}

function PixelHero({ colorMode, umbrellaOpen }: { colorMode: ColorMode, umbrellaOpen: boolean }) {
  const hatColor = colorMode === 'RED' ? '#ef4444' : '#3b82f6';
  const shirtColor = colorMode === 'RED' ? '#fda4af' : '#7dd3fc'; // Soft pink and soft blue
  const pantsColor = colorMode === 'RED' ? '#be123c' : '#0369a1';
  
  return (
    <div className="relative w-16 h-24 flex flex-col items-center">
      {/* Umbrella - Now more of a tech/magic canopy to match the hero */}
      <AnimatePresence mode="wait">
        {umbrellaOpen ? (
          <motion.div
            key="umbrella"
            initial={{ scale: 0.5, y: 10, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.5, y: 10, opacity: 0 }}
            className="absolute -top-16 left-1/2 -translate-x-1/2 w-32 h-20 z-50"
          >
            <svg viewBox="0 0 100 70" className="w-full h-full drop-shadow-2xl overflow-visible">
              <defs>
                <clipPath id="umbrella-clip">
                  <path d="M5,50 Q50,-10 95,50 L95,50 Q75,40 55,50 Q30,40 5,50 Z" />
                </clipPath>
              </defs>
              
              <g clipPath="url(#umbrella-clip)">
                <rect x="0" y="0" width="100" height="70" fill={hatColor} />
                <rect x="0" y="0" width="100" height="70" fill="url(#pixel-pattern)" fillOpacity="0.2" />
              </g>
              
              <path 
                d="M5,50 Q50,-10 95,50 L95,50 Q75,40 55,50 Q30,40 5,50 Z" 
                fill="none" 
                stroke="black" 
                strokeWidth="2" 
              />
              <path d="M50,10 L50,65" fill="none" stroke="black" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </motion.div>
        ) : (
          <motion.div
            key="umbrella-closed"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="absolute -top-4 right-0 w-3 h-20 bg-black rounded-full border-2 border-slate-700 rotate-[15deg] shadow-lg"
          />
        )}
      </AnimatePresence>

      {/* PIXEL HERO BODY */}
      <div className="relative w-14 h-20 z-20">
        <svg viewBox="0 0 64 80" className="w-full h-full drop-shadow-lg scale-110">
          {/* Hat (Mode specific) */}
          <path d="M12,20 L52,20 L52,35 L12,35 Z" fill={hatColor} stroke="black" strokeWidth="2" />
          <path d="M10,25 L54,25 L54,32 L10,32 Z" fill={hatColor} stroke="black" strokeWidth="2" />
          {/* Hat Ears */}
          <rect x="15" y="10" width="10" height="10" fill={hatColor} stroke="black" strokeWidth="1.5" />
          <rect x="39" y="10" width="10" height="10" fill={hatColor} stroke="black" strokeWidth="1.5" />
          <rect x="18" y="13" width="4" height="4" fill="rgba(255,255,255,0.3)" />
          <rect x="42" y="13" width="4" height="4" fill="rgba(255,255,255,0.3)" />

          {/* Hair (Green) */}
          <path d="M14,35 L50,35 L50,45 L14,45 Z" fill="#65a30d" stroke="black" strokeWidth="2" />
          <path d="M12,40 L16,40 L16,50 L12,50 Z" fill="#65a30d" stroke="black" strokeWidth="2" />
          <path d="M48,40 L52,40 L52,50 L48,50 Z" fill="#65a30d" stroke="black" strokeWidth="2" />

          {/* Face */}
          <rect x="16" y="32" width="32" height="28" fill="#ffedd5" stroke="black" strokeWidth="2" />
          {/* Elf Ears */}
          <path d="M10,40 L16,40 L16,48 L10,48 Z" fill="#ffedd5" stroke="black" strokeWidth="1.5" />
          <path d="M48,40 L54,40 L54,48 L48,48 Z" fill="#ffedd5" stroke="black" strokeWidth="1.5" />
          
          {/* Eyes */}
          <rect x="22" y="44" width="6" height="8" fill="black" />
          <rect x="36" y="44" width="6" height="8" fill="black" />
          <rect x="22" y="44" width="2" height="2" fill="white" />
          <rect x="36" y="44" width="2" height="2" fill="white" />

          {/* Mouth & Tooth */}
          <rect x="28" y="56" width="8" height="2" fill="black" />
          <rect x="30" y="56" width="2" height="2" fill="white" />

          {/* Shirt (Dynamic) */}
          <path d="M18,60 L46,60 L46,75 L18,75 Z" fill={shirtColor} stroke="black" strokeWidth="2" />
          <path d="M15,62 L18,62 L18,70 L15,70 Z" fill={shirtColor} stroke="black" strokeWidth="1.5" />
          <path d="M46,62 L49,62 L49,70 L46,70 Z" fill={shirtColor} stroke="black" strokeWidth="1.5" />

          {/* Pants (Dynamic) */}
          <path d="M20,75 L44,75 L44,82 L20,82 Z" fill={pantsColor} stroke="black" strokeWidth="2" />
          <rect x="22" y="82" width="8" height="4" fill="black" />
          <rect x="34" y="82" width="8" height="4" fill="black" />
        </svg>
      </div>

      {/* Animated Glow */}
      <div className={`absolute inset-0 blur-3xl opacity-20 pointer-events-none rounded-full ${colorMode === 'RED' ? 'bg-red-500' : 'bg-blue-500'}`} />
    </div>
  );
}

