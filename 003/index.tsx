
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// --- Constants ---
const BALL_TYPES = ['🔴', '🟡', '🔵', '🟢'];
const BALL_POOL = [...BALL_TYPES, ...BALL_TYPES, ...BALL_TYPES, ...BALL_TYPES, ...BALL_TYPES];
const COLS = 4;
const ROWS = 4;
const MAX_MOVES = 20;
const EMPTY = '⚫'; 
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
  const [hand, setHand] = useState<(string)[]>([]);
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
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
      const numGiggles = 4;
      const startTime = ctx.currentTime;
      for (let i = 0; i < numGiggles; i++) {
        const t = startTime + (i * 0.08);
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        const freq = (800 + (i * 100) + Math.random() * 50) * pitchMultiplier;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq + 200, t + 0.07);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.15, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.08);
      }
    }, delay);
  };

  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setTargetAtTime(isMuted ? 0 : 0.05, 0, 0.1);
    }
  }, [isMuted]);

  useEffect(() => {
    const interval = setInterval(() => {
      setParticles(prev => prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.12,
          rotation: p.rotation + p.vr,
          life: p.life - 2
        }))
        .filter(p => p.life > 0)
      );
      setFloatingTexts(prev => prev
        .map(t => ({ ...t, y: t.y - 1.2, life: t.life - 1.5 }))
        .filter(t => t.life > 0)
      );
    }, 16);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (gameState === 'WIN' || gameState === 'LOSE' || isPerforming) {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  }, [gameState, isPerforming]);

  const createExplosion = (r: number, c: number, colorEmoji: string) => {
    const colors: Record<string, string> = {
      '🔴': '#ff5e7d', '🟡': '#ffeb3b', '🔵': '#4fc3f7', '🟢': '#81c784'
    };
    
    // 獲取棋盤實際尺寸來計算座標
    const boardWidth = gridContainerRef.current?.clientWidth || 300;
    const boardHeight = gridContainerRef.current?.clientHeight || 300;
    const cellWidth = boardWidth / COLS;
    const cellHeight = boardHeight / ROWS;
    
    // 計算爆炸中心點
    const targetX = (c + 0.5) * cellWidth;
    const targetY = (r + 0.5) * cellHeight;

    const pColor = colors[colorEmoji] || (['#ff5e7d', '#ffeb3b', '#4fc3f7', '#81c784', '#f472b6', '#fbbf24'][Math.floor(Math.random() * 6)]);
    const newParticles: Particle[] = [];
    
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      newParticles.push({
        id: particleIdRef.current++,
        x: targetX,
        y: targetY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: pColor,
        life: 120 + Math.random() * 40,
        size: 5 + Math.random() * 5,
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10
      });
    }

    const slogans = ["嘿嘿嘿！", "嘻嘻！", "好開心！", "抱抱！", "哇！漂亮！", "太棒了！", "禮物！", "能量變煙火！"];
    setFloatingTexts(prev => [...prev, {
      id: floatingTextIdRef.current++,
      x: targetX,
      y: targetY,
      text: slogans[Math.floor(Math.random() * slogans.length)],
      life: 130
    }]);
    setParticles(prev => [...prev, ...newParticles]);
  };

  const runVictoryPerformance = async (remainingMoves: number) => {
    setIsPerforming(true);
    setGameState('EXPLODING');
    
    for (let i = 0; i < remainingMoves; i++) {
      setMovesLeft(prev => prev - 1);
      const randomR = Math.floor(Math.random() * ROWS);
      const randomC = Math.floor(Math.random() * COLS);
      setFlash(true);
      setScreenShake(true);
      playBabyGiggle(0, 1 + (i * 0.05));
      createExplosion(randomR, randomC, '');
      setTimeout(() => setFlash(false), 50);
      setTimeout(() => setScreenShake(false), 100);
      const sleepTime = Math.max(100, 300 - (i * 10));
      await new Promise(res => setTimeout(res, sleepTime));
    }
    
    await new Promise(res => setTimeout(res, 500));
    setGameState('WIN');
    setIsPerforming(false);
  };

  const checkAndExplode = async (currentGrid: string[][], currentHand: string[], currentMoves: number) => {
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
          playBabyGiggle(i * 120);
          createExplosion(r, c, color);
        });
        setClearedCount(prev => prev + cluster.length);
        await new Promise(res => setTimeout(res, 250));
      }
      setTimeout(() => setFlash(false), 150);
      setTimeout(() => setScreenShake(false), 400);
      await new Promise(res => setTimeout(res, 500));
      setGrid(newGrid);
      const ballsInGrid = newGrid.flat().filter(b => b !== EMPTY).length;
      const ballsInHand = currentHand.filter(b => b !== EMPTY).length;
      if (ballsInGrid === 0 && ballsInHand === 0) {
        if (currentMoves > 0) await runVictoryPerformance(currentMoves);
        else setGameState('WIN');
      } else setGameState('PLAYING');
      return true;
    }
    return false;
  };

  const pushItem = async (direction: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT', index: number) => {
    if (gameState !== 'PLAYING' || selectedHandIdx === null || movesLeft <= 0) return;
    const newGrid = grid.map(row => [...row]);
    const newHand = [...hand];
    const pushedIn = hand[selectedHandIdx];
    let pushedOut = '';
    if (direction === 'LEFT') {
      pushedOut = newGrid[index][COLS - 1];
      for (let c = COLS - 1; c > 0; c--) newGrid[index][c] = newGrid[index][c - 1];
      newGrid[index][0] = pushedIn;
    } else if (direction === 'RIGHT') {
      pushedOut = newGrid[index][0];
      for (let c = 0; c < COLS - 1; c++) newGrid[index][c] = newGrid[index][c + 1];
      newGrid[index][COLS - 1] = pushedIn;
    } else if (direction === 'TOP') {
      pushedOut = newGrid[ROWS - 1][index];
      for (let r = ROWS - 1; r > 0; r--) newGrid[r][index] = newGrid[r - 1][index];
      newGrid[0][index] = pushedIn;
    } else if (direction === 'BOTTOM') {
      pushedOut = newGrid[0][index];
      for (let r = 0; r < ROWS - 1; r++) newGrid[r][index] = newGrid[r + 1][index];
      newGrid[ROWS - 1][index] = pushedIn;
    }
    newHand[selectedHandIdx] = pushedOut;
    setGrid(newGrid);
    setHand(newHand);
    const nextMoves = movesLeft - 1;
    setMovesLeft(nextMoves);
    setSelectedHandIdx(null);
    const exploded = await checkAndExplode(newGrid, newHand, nextMoves);
    if (!exploded && nextMoves <= 0) setGameState('LOSE');
  };

  const initGame = useCallback(() => {
    initAudio();
    const shuffled = [...BALL_POOL].sort(() => Math.random() - 0.5);
    const initialGrid: string[][] = [];
    for (let r = 0; r < ROWS; r++) initialGrid.push(shuffled.slice(r * COLS, (r + 1) * COLS));
    const initialHand = shuffled.slice(ROWS * COLS);
    setGrid(initialGrid);
    setHand(initialHand);
    setMovesLeft(MAX_MOVES);
    setClearedCount(0);
    setGameState('PLAYING');
    setSelectedHandIdx(null);
    setParticles([]);
    setFloatingTexts([]);
    setIsPerforming(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className={`min-h-screen bg-indigo-950 text-white flex flex-col items-center p-4 font-sans select-none overflow-x-hidden overflow-y-auto relative transition-transform duration-75 pb-20 ${screenShake ? 'animate-shake' : ''}`}>
      
      <div className={`fixed inset-0 bg-yellow-100 pointer-events-none z-[100] transition-opacity duration-150 ${flash ? 'opacity-30' : 'opacity-0'}`} />

      {/* Header HUD */}
      <div className="w-full max-w-xl flex justify-between items-start mb-4 pt-2 z-10">
        <div className={`bg-white px-3 md:px-5 py-2 rounded-2xl border-4 border-indigo-400 shadow-lg text-black transform rotate-1 transition-all duration-300 ${isPerforming ? 'scale-110 md:scale-125 border-yellow-400 ring-4 ring-yellow-400/50' : ''}`}>
          <div className="text-[10px] font-black text-indigo-600 uppercase text-center">剩餘能量</div>
          <div className={`text-2xl md:text-4xl font-black text-center ${movesLeft <= 5 && !isPerforming ? 'text-red-500 animate-pulse' : 'text-indigo-900'}`}>{movesLeft}</div>
        </div>
        
        <div className="text-center flex-1 mx-2 md:mx-4">
            <div className="bg-pink-500 text-white px-3 md:px-4 py-1 rounded-full text-[8px] md:text-[10px] font-black shadow-lg border-2 border-white mb-1 animate-bounce inline-block uppercase">👶 寶寶開心模式</div>
            <h1 className="text-xl md:text-3xl font-black text-yellow-300 drop-shadow-lg leading-none uppercase tracking-tighter italic">泡泡連連看</h1>
            <div className="mt-1 text-[10px] md:text-xs font-bold text-indigo-300">
              開心進度：{clearedCount} / 20
              <div className="w-full h-2 bg-indigo-900 rounded-full mt-1 overflow-hidden border border-indigo-800">
                <div className="h-full bg-gradient-to-r from-pink-400 via-yellow-300 to-cyan-400 transition-all duration-700" style={{ width: `${(clearedCount / 20) * 100}%` }} />
              </div>
            </div>
        </div>

        <button onClick={() => setIsMuted(!isMuted)} className="w-10 h-10 md:w-12 md:h-12 bg-white text-indigo-600 text-lg md:text-xl rounded-2xl border-4 border-indigo-200 flex items-center justify-center hover:bg-indigo-50 shadow-[0_4px_0_#818cf8] active:translate-y-1 active:shadow-none transition-all">
          {isMuted ? '🔇' : '🔔'}
        </button>
      </div>

      {/* Main Grid Section */}
      <div className="relative p-6 md:p-8 bg-indigo-900/60 rounded-[2.5rem] md:rounded-[3rem] border-[6px] md:border-[10px] border-indigo-800 shadow-[0_0_80px_rgba(0,0,0,0.4)] scale-[0.85] sm:scale-100 z-10 backdrop-blur-md">
        
        {!isPerforming && (
          <>
            <div className="absolute top-0 left-8 right-8 flex justify-around -translate-y-1/2">
              {Array.from({length: COLS}).map((_, i) => (
                <button key={`t-${i}`} onClick={() => pushItem('TOP', i)} className="w-8 h-8 md:w-9 md:h-9 bg-yellow-300 rounded-full border-4 border-indigo-900 text-indigo-900 font-black hover:scale-110 transition-transform shadow-[0_4px_0_#4338ca] active:translate-y-1 active:shadow-none">↓</button>
              ))}
            </div>
            <div className="absolute bottom-0 left-8 right-8 flex justify-around translate-y-1/2">
              {Array.from({length: COLS}).map((_, i) => (
                <button key={`b-${i}`} onClick={() => pushItem('BOTTOM', i)} className="w-8 h-8 md:w-9 md:h-9 bg-yellow-300 rounded-full border-4 border-indigo-900 text-indigo-900 font-black hover:scale-110 transition-transform shadow-[0_4px_0_#4338ca] active:-translate-y-1 active:shadow-none">↑</button>
              ))}
            </div>
            <div className="absolute left-0 top-8 bottom-8 flex flex-col justify-around -translate-x-1/2">
              {Array.from({length: ROWS}).map((_, i) => (
                <button key={`l-${i}`} onClick={() => pushItem('LEFT', i)} className="w-8 h-8 md:w-9 md:h-9 bg-yellow-300 rounded-full border-4 border-indigo-900 text-indigo-900 font-black hover:scale-110 transition-transform shadow-[4px_0_0_#4338ca] active:translate-x-1 active:shadow-none">→</button>
              ))}
            </div>
            <div className="absolute right-0 top-8 bottom-8 flex flex-col justify-around translate-x-1/2">
              {Array.from({length: ROWS}).map((_, i) => (
                <button key={`r-${i}`} onClick={() => pushItem('RIGHT', i)} className="w-8 h-8 md:w-9 md:h-9 bg-yellow-300 rounded-full border-4 border-indigo-900 text-indigo-900 font-black hover:scale-110 transition-transform shadow-[-4px_0_0_#4338ca] active:-translate-x-1 active:shadow-none">←</button>
              ))}
            </div>
          </>
        )}

        <div className="relative overflow-visible rounded-3xl">
          {/* Particle & Text Overlay - Moved Inside Board for Perfect Alignment */}
          <div className="absolute inset-0 pointer-events-none z-50 overflow-visible">
            {particles.map(p => (
              <div key={p.id} style={{ left: p.x, top: p.y, width: p.size, height: p.size, backgroundColor: p.color, opacity: p.life / 100, transform: `translate(-50%, -50%) rotate(${p.rotation}deg) scale(${p.life / 50})`, boxShadow: `0 0 ${p.size * 1.5}px ${p.color}`, filter: 'blur(0.5px)' }} className="absolute rounded-full" />
            ))}
            {floatingTexts.map(t => (
              <div key={t.id} style={{ left: t.x, top: t.y, opacity: t.life / 100, transform: `translate(-50%, -100%) scale(${1.1 - t.life / 300})`, textShadow: '2px 2px 0px rgba(0,0,0,0.5)' }} className="absolute font-black text-xl md:text-2xl text-yellow-300 whitespace-nowrap italic pointer-events-none text-center">{t.text}</div>
            ))}
          </div>

          <div ref={gridContainerRef} className="grid grid-cols-4 grid-rows-4 gap-2 md:gap-3 bg-indigo-950/80 p-3 md:p-4 rounded-3xl border-4 border-indigo-800 shadow-inner min-h-[250px] md:min-h-[300px] min-w-[250px] md:min-w-[300px]">
            {grid.map((row, r) => row.map((cell, c) => {
              const isVoid = cell === EMPTY;
              return (
                <div key={`${r}-${c}`} className={`w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-2xl border-2 text-3xl md:text-4xl transition-all duration-300 ${isVoid ? 'bg-black/40 border-indigo-900' : 'bg-white/5 border-white/10 shadow-[inset_0_0_15px_rgba(255,255,255,0.05)]'}`}>
                  <span className={`${isVoid ? 'opacity-10' : 'animate-float'}`}>{cell}</span>
                </div>
              );
            }))}
          </div>
        </div>
      </div>

      {/* Hand Area */}
      <div className={`mt-2 md:mt-6 w-full max-w-sm bg-white p-3 md:p-4 rounded-[2rem] md:rounded-[2.5rem] border-[4px] md:border-[6px] border-pink-400 shadow-2xl relative z-10 transform rotate-1 transition-opacity duration-300 ${isPerforming ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        <div className="absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2 bg-pink-400 text-white px-4 md:px-6 py-1 rounded-full font-black text-[8px] md:text-[10px] border-2 border-white uppercase tracking-tighter whitespace-nowrap">
          選取球體（包含⚫黑球）推入祭壇
        </div>
        <div className="flex justify-around gap-2 mt-2">
          {hand.map((item, i) => {
             const isVoid = item === EMPTY;
             return (
                <button
                  key={`h-${i}`}
                  onClick={() => setSelectedHandIdx(i)}
                  disabled={gameState === 'EXPLODING' || isPerforming}
                  className={`w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-full text-3xl md:text-4xl transition-all border-4 shadow-xl relative overflow-visible
                    ${selectedHandIdx === i ? 'bg-pink-400 border-yellow-300 scale-110 md:scale-125 -translate-y-2 md:-translate-y-4 ring-4 md:ring-8 ring-pink-300/30 z-20' : 'bg-indigo-50 border-indigo-100 hover:scale-105'}
                    ${isVoid && selectedHandIdx !== i ? 'border-dashed border-indigo-300 animate-pulse-slow' : ''}
                  `}
                >
                  {item}
                  {isVoid && <div className="absolute inset-0 rounded-full border-2 border-indigo-200 opacity-30 border-dashed animate-spin-slow pointer-events-none" />}
                </button>
             );
          })}
        </div>
      </div>

      {/* Game Key / Legend */}
      <div className={`mt-4 w-full max-w-sm grid grid-cols-2 gap-2 z-10 transition-opacity duration-300 ${isPerforming ? 'opacity-30' : 'opacity-100'}`}>
        <div className="bg-indigo-900/80 border border-indigo-700 p-2 rounded-xl flex items-center gap-2 md:gap-3">
          <span className="text-xl md:text-2xl">🔴</span>
          <div className="text-[9px] md:text-[10px] leading-tight">
            <span className="font-black text-yellow-300 block">彩色泡泡</span>
            五顆相連即可消除
          </div>
        </div>
        <div className="bg-indigo-900/80 border border-indigo-700 p-2 rounded-xl flex items-center gap-2 md:gap-3">
          <span className="text-xl md:text-2xl animate-pulse">⚫</span>
          <div className="text-[9px] md:text-[10px] leading-tight">
            <span className="font-black text-cyan-300 block">虛空泡泡</span>
            可用於推動與調度
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="mt-6 md:mt-8 text-center space-y-4 pb-12 z-10 w-full flex flex-col items-center">
        {gameState === 'IDLE' ? (
          <button onClick={initGame} className="group relative px-8 md:px-10 py-4 md:py-5 bg-yellow-300 text-indigo-900 font-black text-2xl md:text-3xl rounded-full border-b-8 border-yellow-500 shadow-2xl transition-all active:translate-y-2 active:border-b-0">
            開始遊戲 🎈
          </button>
        ) : gameState === 'WIN' ? (
          <div className="animate-bounce flex flex-col items-center">
            <h2 className="text-3xl md:text-5xl font-black text-yellow-300 mb-4 italic drop-shadow-lg">寶寶超開心的！✨</h2>
            <button onClick={initGame} className="px-8 md:px-10 py-3 md:py-4 bg-pink-500 text-white font-black text-xl md:text-2xl rounded-full border-b-4 border-pink-800 shadow-lg hover:brightness-110 active:scale-95 transition-all">
              再來玩一次！
            </button>
          </div>
        ) : gameState === 'LOSE' ? (
          <div className="flex flex-col items-center">
            <h2 className="text-3xl md:text-4xl font-black text-indigo-300 mb-4 italic">能量用完了...</h2>
            <button onClick={initGame} className="px-8 py-3 bg-white text-indigo-900 font-black text-xl rounded-full border-b-4 border-indigo-200 hover:bg-indigo-50 active:scale-95 transition-all">
              重新開始 🔄
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 w-full">
            <div className={`text-pink-200 font-black text-[12px] md:text-sm bg-indigo-900/80 px-4 md:px-6 py-2 rounded-full border-2 border-pink-400 shadow-lg animate-pulse ${isPerforming ? 'text-yellow-400 border-yellow-400' : ''}`}>
                {isPerforming ? '✨ 能量大爆發！慶典開始！ ✨' : '策略提示：活用⚫黑球來排擠彩色球！'}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        .animate-float { animation: float 2.5s ease-in-out infinite; }
        @keyframes shake { 0%, 100% { transform: translate(0, 0); } 10% { transform: translate(-4px, -4px) rotate(-1deg); } 30% { transform: translate(4px, 4px) rotate(1deg); } 50% { transform: translate(-4px, 4px) rotate(-1deg); } 70% { transform: translate(4px, -4px) rotate(1deg); } 90% { transform: translate(-2px, -2px) rotate(0deg); } }
        .animate-shake { animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }
        @keyframes pulse-slow { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .animate-pulse-slow { animation: pulse-slow 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<BallGame />);
}
