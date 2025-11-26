/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef } from 'react';
import { Camera, Loader2, Play, RefreshCw, Trophy, Pause } from 'lucide-react';

declare global {
  interface Window {
    tf: any;
    blazeface: any;
  }
}

const FacePong = () => {
  const [gameState, setGameState] = useState<'loading' | 'menu' | 'playing' | 'paused' | 'gameover'>('loading');
  const [score, setScore] = useState({ player: 0, ai: 0 });
  const [winner, setWinner] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const modelRef = useRef<any>(null);
  
  const CANVAS_WIDTH = 600;
  const CANVAS_HEIGHT = 800;
  const PADDLE_WIDTH = 100;
  const PADDLE_HEIGHT = 20;
  const BALL_RADIUS = 8;
  const WIN_SCORE = 5;

  const SENSITIVITY_MIN = 0.25;
  const SENSITIVITY_MAX = 0.75;

  const game = useRef({
    playerX: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2,
    targetPlayerX: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2,
    aiX: CANVAS_WIDTH / 2 - PADDLE_WIDTH / 2,
    ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, dx: 3, dy: 3, speed: 4 },
  });

  useEffect(() => {
    const loadScripts = async () => {
      try {
        setDebugInfo('در حال بار گیری...');
        
        const loadScript = (src: string) => {
          return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        };

        if (!window.tf) {
          await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs');
          await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface');
        }

        setDebugInfo('Loading Face Model...');
        const model = await window.blazeface.load();
        modelRef.current = model;
        
        setGameState('menu');
        setDebugInfo('Ready');
      } catch (err) {
        console.error("Error loading AI:", err);
        setDebugInfo('Error loading AI modules.');
      }
    };

    loadScripts();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const startVideo = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            detectFace();
          };
        }
      } catch (err) {
        console.error("Webcam error:", err);
        setDebugInfo('Please enable camera access');
      }
    }
  };

  const detectFace = async () => {
    if (!modelRef.current || !videoRef.current || videoRef.current.paused || videoRef.current.ended) {
      requestAnimationFrame(detectFace);
      return;
    }

    const returnTensors = false;
    const predictions = await modelRef.current.estimateFaces(videoRef.current, returnTensors);

    if (predictions.length > 0) {
      const start = predictions[0].topLeft;
      const end = predictions[0].bottomRight;
      const size = [end[0] - start[0], end[1] - start[1]];
      
      const faceCenterX = start[0] + (size[0] / 2);
      const videoWidth = videoRef.current.videoWidth;
      
      const rawNormalizedX = faceCenterX / videoWidth;
      const clampedX = Math.max(SENSITIVITY_MIN, Math.min(rawNormalizedX, SENSITIVITY_MAX));
      const remappedX = (clampedX - SENSITIVITY_MIN) / (SENSITIVITY_MAX - SENSITIVITY_MIN);
      const targetX = (1 - remappedX) * (CANVAS_WIDTH - PADDLE_WIDTH);
      
      game.current.targetPlayerX = targetX;
    }

    if (gameState !== 'gameover') {
       requestAnimationFrame(detectFace);
    }
  };

  const updateGame = () => {
    if (gameState !== 'playing') return;

    const g = game.current;
    const lerpFactor = 0.2;
    g.playerX += (g.targetPlayerX - g.playerX) * lerpFactor;

    if (g.playerX < 0) g.playerX = 0;
    if (g.playerX > CANVAS_WIDTH - PADDLE_WIDTH) g.playerX = CANVAS_WIDTH - PADDLE_WIDTH ;

    const targetX = g.ball.x - PADDLE_WIDTH / 2;
    const aiSpeed = 2.8; 
    if (g.aiX < targetX) {
      g.aiX += aiSpeed;
    } else if (g.aiX > targetX) {
      g.aiX -= aiSpeed;
    }
    
    if (g.aiX < 0) g.aiX = 0;
    if (g.aiX > CANVAS_WIDTH - PADDLE_WIDTH) g.aiX = CANVAS_WIDTH - PADDLE_WIDTH;

    g.ball.x += g.ball.dx;
    g.ball.y += g.ball.dy;

    if (g.ball.x + BALL_RADIUS > CANVAS_WIDTH || g.ball.x - BALL_RADIUS < 0) {
      g.ball.dx = -g.ball.dx;
    }

    if (
      g.ball.y + BALL_RADIUS >= CANVAS_HEIGHT - PADDLE_HEIGHT - 10 && 
      g.ball.y - BALL_RADIUS <= CANVAS_HEIGHT - 10 &&
      g.ball.x >= g.playerX &&
      g.ball.x <= g.playerX + PADDLE_WIDTH
    ) {
      g.ball.dy = -Math.abs(g.ball.dy * 1.05);
      const hitPoint = g.ball.x - (g.playerX + PADDLE_WIDTH / 2);
      g.ball.dx += hitPoint * 0.1;
    }

    if (
      g.ball.y - BALL_RADIUS <= PADDLE_HEIGHT + 10 &&
      g.ball.y + BALL_RADIUS >= 10 &&
      g.ball.x >= g.aiX &&
      g.ball.x <= g.aiX + PADDLE_WIDTH
    ) {
      g.ball.dy = Math.abs(g.ball.dy * 1.05);
    }

    if (g.ball.y > CANVAS_HEIGHT) {
      setScore(prev => {
        const newScore = { ...prev, ai: prev.ai + 1 };
        checkWin(newScore);
        return newScore;
      });
      resetBall();
    } else if (g.ball.y < 0) {
      setScore(prev => {
        const newScore = { ...prev, player: prev.player + 1 };
        checkWin(newScore);
        return newScore;
      });
      resetBall();
    }

    draw();
    requestRef.current = requestAnimationFrame(updateGame);
  };

  const checkWin = (currentScore: { player: number; ai: number }) => {
    if (currentScore.player >= WIN_SCORE) {
      setWinner('Player');
      setGameState('gameover');
    } else if (currentScore.ai >= WIN_SCORE) {
      setWinner('AI');
      setGameState('gameover');
    }
  };

  const resetBall = () => {
    game.current.ball = { 
      x: CANVAS_WIDTH / 2, 
      y: CANVAS_HEIGHT / 2, 
      dx: 0, 
      dy: 0,
      speed: 4
    };

    setTimeout(() => {
      game.current.ball.dx = (Math.random() > 0.5 ? 1 : -1) * 3;
      game.current.ball.dy = (Math.random() > 0.5 ? 1 : -1) * 3;
    }, 1000);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = '#333';
    ctx.setLineDash([10, 15]);
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_HEIGHT / 2);
    ctx.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT / 2);
    ctx.stroke();

    ctx.fillStyle = '#4ade80';
    ctx.shadowColor = '#4ade80';
    ctx.shadowBlur = 15;
    ctx.fillRect(game.current.playerX, CANVAS_HEIGHT - PADDLE_HEIGHT - 10, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#f87171';
    ctx.shadowColor = '#f87171';
    ctx.shadowBlur = 15;
    ctx.fillRect(game.current.aiX, 10, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(game.current.ball.x, game.current.ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  };

  const startGame = () => {
    setScore({ player: 0, ai: 0 });
    resetBall();
    setGameState('playing');
    startVideo();
  };

  const togglePause = () => {
    if (gameState === 'playing') {
      setGameState('paused');
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    } else if (gameState === 'paused') {
      setGameState('playing');
    }
  };

  useEffect(() => {
    if (gameState === 'playing') {
      requestRef.current = requestAnimationFrame(updateGame);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, score]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 font-sans">
      <h1 className="text-4xl font-black tracking-tighter mb-4 text-transparent bg-clip-text bg-linear-to-r from-green-400 to-blue-500">
        FACE PONG
      </h1>

      <div className="flex flex-col lg:flex-row gap-8 items-start" >
        
        <div dir='rtl' className="relative border-4 border-gray-800 rounded-lg overflow-hidden shadow-2xl bg-gray-900">
          <canvas 
            ref={canvasRef} 
            width={CANVAS_WIDTH} 
            height={CANVAS_HEIGHT}
            className="block max-w-[90vw] max-h-[70vh] w-auto h-auto object-contain"
          />

          {gameState === 'menu' && (
            <div dir='rtl' className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10">
              <p className="mb-6 text-gray-300 text-center max-w-xs">
                راکت را با موقعیت سر خود کنترل کنید.<br/>
                سر خود را به <span className="text-green-400">چپ</span> و <span className="text-green-400">راست</span> حرکت دهید تا راکت جابجا شود.
              </p>
              <button 
                onClick={startGame}
                className="flex items-center gap-2 px-8 py-4 bg-white text-black font-bold rounded-full hover:scale-105 transition hover:bg-green-400"
              >
                <Play size={24} /> شروع بازی
              </button>
            </div>
          )}

          {gameState === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10">
              <h2 className="text-3xl font-bold mb-6">توقف</h2>
              <button 
                onClick={togglePause}
                className="flex items-center gap-2 px-8 py-4 bg-white text-black font-bold rounded-full hover:scale-105 transition hover:bg-green-400"
              >
                ادامه بازی
                <Play size={24} />     
              </button>
            </div>
          )}

          {gameState === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20">
              <Loader2 className="animate-spin text-green-500 mb-4" size={48} />
              <p className="text-gray-400 animate-pulse">{debugInfo}</p>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-30">
              <Trophy size={64} className={winner === 'Player' ? 'text-yellow-400' : 'text-red-500'} />
              <h2 className="text-3xl font-bold mt-4 mb-2">{winner}  برنده شد!</h2>
              <p className="text-xl mb-6">امتیازات: {score.player} - {score.ai}</p>
              <button 
                onClick={startGame}
                className="flex items-center gap-2 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-full font-bold transition"
              >
                دوباره
                <RefreshCw size={20} /> 
              </button>
            </div>
          )}
          
          <div className="absolute top-4 left-4 text-2xl font-black text-white/50">{score.ai}</div>
          <div className="absolute bottom-4 left-4 text-2xl font-black text-white/50">{score.player}</div>
          
          {(gameState === 'playing' || gameState === 'paused') && (
            <button 
              onClick={togglePause}
              className="absolute top-4 right-4 p-2 bg-gray-800/50 hover:bg-gray-700 rounded-full text-white transition z-40"
            >
              {gameState === 'paused' ? <Play size={20} /> : <Pause size={20} />}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <div dir='rtl' className="bg-gray-900 p-4 rounded-xl border border-gray-800">
            <h3 className="flex items-center gap-2 font-bold mb-3 text-gray-400">
              <Camera size={18} /> دوربین
            </h3>
            
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-gray-700">
              <video 
                ref={videoRef}
                className="w-full h-full object-cover transform -scale-x-100 opacity-60" 
                playsInline 
                muted
              />
              
              <div className="absolute inset-0 pointer-events-none">
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-black/60 border-r border-white/20" 
                  style={{ width: `${SENSITIVITY_MIN * 100}%` }}
                />
                
                <div 
                  className="absolute top-0 bottom-0 border-x border-white/10"
                  style={{ 
                    left: `${SENSITIVITY_MIN * 100}%`, 
                    right: `${(1 - SENSITIVITY_MAX) * 100}%` 
                  }}
                >
                   <div className="w-full h-full flex items-center justify-center">
                     <div className="w-px h-1/2 bg-white/20"></div>
                   </div>
                </div>

                <div 
                  className="absolute right-0 top-0 bottom-0 bg-black/60 border-l border-white/20" 
                  style={{ width: `${(1 - SENSITIVITY_MAX) * 100}%` }}
                />
              </div>
            </div>
            
            <div className="mt-4 text-xs text-gray-500 space-y-1">
            <p>1. صورت خود را داخل کادر روشن‌تر وسط نگه دارید.</p>
            <p>2. اندکی به چپ یا راست داخل این کادر حرکت کنید تا راکت را کنترل کنید.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default FacePong;