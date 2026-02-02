
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// --- Constants ---
const BALL_TYPES = ['🔴', '🟡', '🔵', '🟢'];
const SPARKLE = '✨';
const EMPTY = '⚫'; 
const COLS = 5;
const ROWS = 5;
const MAX_MOVES = 30;
const MATCH_REQUIREMENT = 5;

type GameState = 'IDLE' | 'PLAYING' | 'EXPLODING' | 'WIN' | 'LOSE';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  size: number;
  rotation: number;
  vr: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
}

const BallGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('IDLE');
  const [grid, setGrid] = useState<(string)[][]>([]);
  const [movesLeft, setMovesLeft] = useState(MAX_MOVES);
  const [clearedCount, setClearedCount] = useState(0);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [screenShake, setScreenShake] = useState(false);
  const [flash, setFlash] = useState(false);
  const [isPerforming, setIsPerforming] = useState(false);
  
  const particleIdRef = useRef(0);
  const floatingTextIdRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const initAudio = () => {
    if (audioCtxRef.current) return;
    audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    gainNodeRef.current = audioCtxRef.current.createGain();
    gainNodeRef.current.connect(audioCtxRef.current.destination);
    gainNodeRef.current.gain.value = isMuted ? 0 : 0.05;

    const melody = [329.63, 392.00, 523.25, 392.00, 523.25];
    let time = audioCtxRef.current.currentTime;
    const playLoop = () => {
      if (!audioCtxRef.current) return;
      const playNote = (freq: number, startTime: number, duration: number) => {
        if (!audioCtxRef.current || !gainNodeRef.current) return;
        const osc = audioCtxRef.current.createOscillator();
        const noteGain = audioCtxRef.current.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        noteGain.gain.setValueAtTime(0, startTime);
        noteGain.gain.linearRampToValueAtTime(0.05, startTime + 0.05);
        noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.connect(noteGain);
        noteGain.connect(gainNodeRef.current!);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      melody.forEach((freq, i) => playNote(freq, time + i * 0.4, 0.3));
      time += melody.length * 0.4;
      setTimeout(playLoop, melody.length * 400);
    };
    playLoop();
  };

  const playBabyGiggle = (delay = 0, pitchMultiplier = 1) => {
    setTimeout(() => {
      if (!audioCtxRef.current || isMuted) return;
      const ctx = audioCtxRef.current;
      const numGiggles = 5;
      const startTime = ctx.currentTime;
      for (let i = 0; i < numGiggles; i++) {
        const t = startTime + (i * 0.07);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        const freq = (900 + (i * 120) + Math.random() * 50) * pitchMultiplier;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq + 250, t + 0.06);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.2, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.07);
      }
    }, delay);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles(prev => prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.15,
          rotation: p.rotation + p.vr,
          life: p.life - 2.5
        }))
        .filter(p => p.life > 0)
      );
      setFloatingTexts(prev => prev
        .map(t => ({ ...t, y: t.y - 1.5, life: t.life - 2 }))
        .filter(t => t.life > 0)
      );
    }, 16);
    return () => clearInterval(interval);
  }, []);

  const createExplosion = (r: number, c: number, colorEmoji: string, isBig = false) => {
    const colors: Record<string, string> = {
      '🔴': '#ff5e7d', '🟡': '#ffeb3b', '🔵': '#4fc3f7', '🟢': '#81c784'
    };
    
    const boardWidth = gridContainerRef.current?.clientWidth || 350;
    const boardHeight = gridContainerRef.current?.clientHeight || 350;
    const cellWidth = boardWidth / COLS;
    const cellHeight = boardHeight / ROWS;
    
    const targetX = (c + 0.5) * cellWidth;
    const targetY = (r + 0.5) * cellHeight;

    const pColor = colors[colorEmoji] || (['#ff5e7d', '#ffeb3b', '#4fc3f7', '#81c784', '#f472b6', '#fbbf24', '#a78bfa'][Math.floor(Math.random() * 7)]);
    const newParticles: Particle[] = [];
    const count = isBig ? 120 : 60;
    
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (isBig ? 4 : 2) + Math.random() * (isBig ? 12 : 8);
      newParticles.push({
        id: particleIdRef.current++,
        x: targetX,
        y: targetY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: pColor,
        life: 130 + Math.random() * 50,
        size: (isBig ? 6 : 4) + Math.random() * 6,
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 15
      });
    }

    const slogans = isBig ? ["超級煙火！", "太完美了！", "大獎慶祝！", "哇哇哇！"] : ["嘿嘿！", "嘻嘻！", "好開心！", "太棒了！"];
    setFloatingTexts(prev => [...prev, {
      id: floatingTextIdRef.current++,
      x: targetX,
      y: targetY,
      text: slogans[Math.floor(Math.random() * slogans.length)],
      life: 150
    }]);
    setParticles(prev => [...prev, ...newParticles]);
  };

  const runVictoryPerformance = async (remainingMoves: number) => {
    setIsPerforming(true);
    setGameState('EXPLODING');
    
    const celebrationMoves = Math.max(remainingMoves, 10);
    
    for (let i = 0; i < celebrationMoves; i++) {
      if (movesLeft > 0) setMovesLeft(prev => prev - 1);
      const randomR = Math.floor(Math.random() * ROWS);
      const randomC = Math.floor(Math.random() * COLS);
      setFlash(true);
      setScreenShake(true);
      playBabyGiggle(0, 0.8 + (i * 0.05));
      createExplosion(randomR, randomC, '', true);
      setTimeout(() => setFlash(false), 60);
      setTimeout(() => setScreenShake(false), 120);
      const sleepTime = Math.max(80, 250 - (i * 12));
      await new Promise(res => setTimeout(res, sleepTime));
    }
    
    setGameState('WIN');
    setIsPerforming(false);
  };

  const checkAndExplode = async (currentGrid: string[][], currentMoves: number) => {
    let explodedAny = false;
    const newGrid = currentGrid.map(row => [...row]);
    const clusters: [number, number][][] = [];

    for (const color of BALL_TYPES) {
      const visited = new Set<string>();
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (newGrid[r][c] === color && !visited.has(`${r}-${c}`)) {
            const cluster: [number, number][] = [];
            const queue: [number, number][] = [[r, c]];
            visited.add(`${r}-${c}`);
            let head = 0;
            while(head < queue.length){
              const [currR, currC] = queue[head++];
              cluster.push([currR, currC]);
              const neighbors = [[currR-1, currC], [currR+1, currC], [currR, currC-1], [currR, currC+1]];
              for(const [nr, nc] of neighbors){
                if(nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS){
                  if(newGrid[nr][nc] === color && !visited.has(`${nr}-${nc}`)){
                    visited.add(`${nr}-${nc}`);
                    queue.push([nr, nc]);
                  }
                }
              }
            }
            if (cluster.length >= MATCH_REQUIREMENT) {
              clusters.push(cluster);
              explodedAny = true;
            }
          }
        }
      }
    }

    if (explodedAny) {
      setGameState('EXPLODING');
      setScreenShake(true);
      setFlash(true);
      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i];
        const color = newGrid[cluster[0][0]][cluster[0][1]];
        cluster.forEach(([r, c]) => {
          newGrid[r][c] = EMPTY;
          playBabyGiggle(i * 100);
          createExplosion(r, c, color);
        });
        setClearedCount(prev => prev + cluster.length);
        await new Promise(res => setTimeout(res, 200));
      }
      setTimeout(() => setFlash(false), 100);
      setTimeout(() => setScreenShake(false), 300);
      await new Promise(res => setTimeout(res, 400));
      setGrid(newGrid);
      
      const ballsLeft = newGrid.flat().filter(b => BALL_TYPES.includes(b)).length;
      if (ballsLeft === 0) {
        await runVictoryPerformance(currentMoves);
      } else {
        setGameState('PLAYING');
      }
      return true;
    }
    return false;
  };

  const pushAction = async (direction: 'T' | 'B' | 'L' | 'R', index: number) => {
    if (gameState !== 'PLAYING' || movesLeft <= 0) return;
    
    const newGrid = grid.map(row => [...row]);
    
    if (direction === 'L') {
      const row = newGrid[index];
      const first = row.shift()!;
      row.push(first);
    } else if (direction === 'R') {
      const row = newGrid[index];
      const last = row.pop()!;
      row.unshift(last);
    } else if (direction === 'T') {
      const first = newGrid[0][index];
      for (let r = 0; r < ROWS - 1; r++) newGrid[r][index] = newGrid[r + 1][index];
      newGrid[ROWS - 1][index] = first;
    } else if (direction === 'B') {
      const last = newGrid[ROWS - 1][index];
      for (let r = ROWS - 1; r > 0; r--) newGrid[r][index] = newGrid[r - 1][index];
      newGrid[0][index] = last;
    }

    setGrid(newGrid);
    const nextMoves = movesLeft - 1;
    setMovesLeft(nextMoves);
    
    const exploded = await checkAndExplode(newGrid, nextMoves);
    if (!exploded && nextMoves <= 0) setGameState('LOSE');
  };

  const initGame = useCallback(() => {
    initAudio();
    // 20色珠 (每種5顆) + 5火花 = 25格
    const pool = [
      ...Array(5).fill('🔴'), ...Array(5).fill('🟡'), 
      ...Array(5).fill('🔵'), ...Array(5).fill('🟢'),
      ...Array(5).fill(SPARKLE)
    ].sort(() => Math.random() - 0.5);

    const initialGrid: string[][] = [];
    for (let r = 0; r < ROWS; r++) initialGrid.push(pool.slice(r * COLS, (r + 1) * COLS));
    
    setGrid(initialGrid);
    setMovesLeft(MAX_MOVES);
    setClearedCount(0);
    setGameState('PLAYING');
    setParticles([]);
    setFloatingTexts([]);
    setIsPerforming(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className={`min-h-screen bg-indigo-950 text-white flex flex-col items-center p-4 font-sans select-none overflow-x-hidden overflow-y-auto relative transition-transform duration-75 pb-20 ${screenShake ? 'animate-shake' : ''}`}>
      
      <div className={`fixed inset-0 bg-yellow-100 pointer-events-none z-[100] transition-opacity duration-150 ${flash ? 'opacity-30' : 'opacity-0'}`} />

      {/* Header */}
      <div className="w-full max-w-xl flex justify-between items-center mb-6 pt-2 z-10">
        <div className={`bg-white px-4 py-2 rounded-2xl border-4 border-indigo-400 shadow-xl text-black transform -rotate-2 transition-all duration-300 ${isPerforming ? 'scale-110 border-yellow-400 ring-4 ring-yellow-400/50' : ''}`}>
          <div className="text-[10px] font-black text-indigo-600 uppercase text-center">剩餘能量</div>
          <div className={`text-3xl font-black text-center ${movesLeft <= 5 && !isPerforming ? 'text-red-500 animate-pulse' : 'text-indigo-900'}`}>{movesLeft}</div>
        </div>
        
        <div className="text-center flex-1 mx-4">
            <div className="bg-pink-500 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg border-2 border-white mb-1 animate-bounce inline-block">5x5 祭壇冒險</div>
            <h1 className="text-2xl md:text-4xl font-black text-yellow-300 drop-shadow-lg leading-none italic tracking-tighter uppercase">大慶典連連看</h1>
            <div className="mt-1 text-[10px] md:text-xs font-bold text-indigo-300">
              進度：{clearedCount} / 20 色珠
              <div className="w-full h-2 bg-indigo-900 rounded-full mt-1 overflow-hidden border border-indigo-800">
                <div className="h-full bg-gradient-to-r from-pink-400 via-yellow-300 to-cyan-400 transition-all duration-700" style={{ width: `${(clearedCount / 20) * 100}%` }} />
              </div>
            </div>
        </div>

        <button onClick={() => setIsMuted(!isMuted)} className="w-12 h-12 bg-white text-indigo-600 text-xl rounded-2xl border-4 border-indigo-200 flex items-center justify-center hover:bg-indigo-50 shadow-[0_4px_0_#818cf8] active:translate-y-1 active:shadow-none transition-all">
          {isMuted ? '🔇' : '🔔'}
        </button>
      </div>

      {/* Main Grid Section */}
      <div className="relative p-8 md:p-10 bg-indigo-900/40 rounded-[3rem] border-[8px] border-indigo-800/60 shadow-[0_0_80px_rgba(0,0,0,0.5)] scale-[0.9] sm:scale-100 z-10 backdrop-blur-xl">
        
        {!isPerforming && gameState === 'PLAYING' && (
          <>
            {/* Top Buttons */}
            <div className="absolute top-0 left-10 right-10 flex justify-around -translate-y-1/2">
              {Array.from({length: COLS}).map((_, i) => (
                <button key={`t-${i}`} onClick={() => pushAction('B', i)} className="w-9 h-9 bg-yellow-300 rounded-full border-4 border-indigo-900 text-indigo-900 font-black hover:scale-110 transition-transform shadow-[0_4px_0_#4338ca] active:translate-y-1 active:shadow-none">↓</button>
              ))}
            </div>
            {/* Bottom Buttons */}
            <div className="absolute bottom-0 left-10 right-10 flex justify-around translate-y-1/2">
              {Array.from({length: COLS}).map((_, i) => (
                <button key={`b-${i}`} onClick={() => pushAction('T', i)} className="w-9 h-9 bg-yellow-300 rounded-full border-4 border-indigo-900 text-indigo-900 font-black hover:scale-110 transition-transform shadow-[0_4px_0_#4338ca] active:-translate-y-1 active:shadow-none">↑</button>
              ))}
            </div>
            {/* Left Buttons */}
            <div className="absolute left-0 top-10 bottom-10 flex flex-col justify-around -translate-x-1/2">
              {Array.from({length: ROWS}).map((_, i) => (
                <button key={`l-${i}`} onClick={() => pushAction('R', i)} className="w-9 h-9 bg-yellow-300 rounded-full border-4 border-indigo-900 text-indigo-900 font-black hover:scale-110 transition-transform shadow-[4px_0_0_#4338ca] active:translate-x-1 active:shadow-none">→</button>
              ))}
            </div>
            {/* Right Buttons */}
            <div className="absolute right-0 top-10 bottom-10 flex flex-col justify-around translate-x-1/2">
              {Array.from({length: ROWS}).map((_, i) => (
                <button key={`r-${i}`} onClick={() => pushAction('L', i)} className="w-9 h-9 bg-yellow-300 rounded-full border-4 border-indigo-900 text-indigo-900 font-black hover:scale-110 transition-transform shadow-[-4px_0_0_#4338ca] active:-translate-x-1 active:shadow-none">←</button>
              ))}
            </div>
          </>
        )}

        <div className="relative overflow-visible rounded-3xl">
          {/* Internal Effects Layer */}
          <div className="absolute inset-0 pointer-events-none z-50 overflow-visible">
            {particles.map(p => (
              <div key={p.id} style={{ left: p.x, top: p.y, width: p.size, height: p.size, backgroundColor: p.color, opacity: p.life / 100, transform: `translate(-50%, -50%) rotate(${p.rotation}deg) scale(${p.life / 50})`, boxShadow: `0 0 ${p.size * 2}px ${p.color}`, filter: 'blur(0.5px)' }} className="absolute rounded-full" />
            ))}
            {floatingTexts.map(t => (
              <div key={t.id} style={{ left: t.x, top: t.y, opacity: t.life / 100, transform: `translate(-50%, -100%) scale(${1.2 - t.life / 400})`, textShadow: '2px 2px 0px rgba(0,0,0,0.5)' }} className="absolute font-black text-2xl text-yellow-300 whitespace-nowrap italic pointer-events-none text-center">{t.text}</div>
            ))}
          </div>

          <div ref={gridContainerRef} className="grid grid-cols-5 grid-rows-5 gap-2 bg-indigo-950/90 p-3 rounded-3xl border-4 border-indigo-800/80 shadow-inner min-w-[280px] min-h-[280px] md:min-w-[350px] md:min-h-[350px]">
            {grid.map((row, r) => row.map((cell, c) => {
              const isEmpty = cell === EMPTY;
              const isSparkle = cell === SPARKLE;
              return (
                <div key={`${r}-${c}`} className={`w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-2xl border-2 text-3xl md:text-4xl transition-all duration-300 ${isEmpty ? 'bg-black/40 border-indigo-900/50' : 'bg-white/5 border-white/10 shadow-[inset_0_0_15px_rgba(255,255,255,0.05)]'} ${isSparkle ? 'animate-pulse border-yellow-400/30' : ''}`}>
                  <span className={`${isEmpty ? 'opacity-10' : 'animate-float'} ${isSparkle ? 'drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : ''}`}>{cell}</span>
                </div>
              );
            }))}
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className={`mt-8 w-full max-w-sm bg-indigo-900/60 border border-indigo-700 p-4 rounded-3xl z-10 grid grid-cols-2 gap-3 transition-opacity duration-300 ${isPerforming ? 'opacity-30' : 'opacity-100'}`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔴🟡🔵🟢</span>
          <div className="text-[10px] leading-tight">
            <span className="font-black text-yellow-300 block">各 5 顆色珠</span>
            連成 5 顆即可消除
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl animate-spin-slow">✨</span>
          <div className="text-[10px] leading-tight">
            <span className="font-black text-cyan-300 block">火花珠</span>
            不需消除，輔助調度
          </div>
        </div>
      </div>

      {/* Control / Status Footer */}
      <div className="mt-8 text-center space-y-6 pb-16 z-10 w-full flex flex-col items-center">
        {gameState === 'IDLE' ? (
          <button onClick={initGame} className="group relative px-12 py-5 bg-yellow-300 text-indigo-900 font-black text-3xl rounded-full border-b-8 border-yellow-600 shadow-2xl transition-all active:translate-y-2 active:border-b-0">
            開始大慶典 🎈
          </button>
        ) : gameState === 'WIN' ? (
          <div className="animate-bounce flex flex-col items-center">
            <h2 className="text-4xl md:text-6xl font-black text-yellow-300 mb-6 italic drop-shadow-[0_4px_10px_rgba(253,224,71,0.5)]">✨ 終極大慶典勝利！ ✨</h2>
            <button onClick={initGame} className="px-12 py-4 bg-pink-500 text-white font-black text-2xl rounded-full border-b-6 border-pink-800 shadow-2xl hover:brightness-110 active:scale-95 transition-all">
              再來一場冒險！
            </button>
          </div>
        ) : gameState === 'LOSE' ? (
          <div className="flex flex-col items-center">
            <h2 className="text-4xl font-black text-indigo-300 mb-6 italic">能量耗盡了...</h2>
            <button onClick={initGame} className="px-10 py-4 bg-white text-indigo-900 font-black text-xl rounded-full border-b-6 border-indigo-300 hover:bg-indigo-50 active:scale-95 transition-all">
              重新注入能量 🔄
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full">
            <div className={`text-pink-200 font-black text-sm md:text-base bg-indigo-950/80 px-8 py-3 rounded-full border-2 border-pink-400 shadow-[0_0_20px_rgba(244,114,182,0.3)] animate-pulse ${isPerforming ? 'text-yellow-400 border-yellow-400' : ''}`}>
                {isPerforming ? '🔥 全螢幕煙火慶祝中！ 🔥' : '點擊邊緣箭頭，讓行列循環移動！'}
            </div>
            {!isPerforming && (
               <button onClick={initGame} className="text-xs font-bold text-indigo-400 underline decoration-indigo-600 underline-offset-4 hover:text-indigo-200 transition-colors">放棄目前局面</button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .animate-float { animation: float 3s ease-in-out infinite; }
        @keyframes shake { 0%, 100% { transform: translate(0, 0); } 10% { transform: translate(-5px, -5px) rotate(-1deg); } 30% { transform: translate(5px, 5px) rotate(1deg); } 50% { transform: translate(-5px, 5px) rotate(-1deg); } 70% { transform: translate(5px, -5px) rotate(1deg); } 90% { transform: translate(-3px, -3px) rotate(0deg); } }
        .animate-shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 10s linear infinite; }
      `}</style>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<BallGame />);
}
