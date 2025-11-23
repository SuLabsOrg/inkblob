import React, { useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit';
import { ArrowRight, Shield, Zap, Globe } from 'lucide-react';

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    alpha: number;
}

export const LandingPage: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let particles: Particle[] = [];
        const particleCount = 100;
        const connectionDistance = 150;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        const initParticles = () => {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    size: Math.random() * 2 + 1,
                    alpha: Math.random() * 0.5 + 0.2,
                });
            }
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Update and draw particles
            particles.forEach((p, i) => {
                p.x += p.vx;
                p.y += p.vy;

                // Bounce off edges
                if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

                // Mouse interaction (gentle repulsion)
                const dx = mousePos.x - p.x;
                const dy = mousePos.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 200) {
                    const force = (200 - dist) / 200;
                    p.vx -= (dx / dist) * force * 0.05;
                    p.vy -= (dy / dist) * force * 0.05;
                }

                // Draw particle
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(100, 149, 237, ${p.alpha})`; // Cornflower Blue
                ctx.fill();

                // Draw connections
                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx2 = p.x - p2.x;
                    const dy2 = p.y - p2.y;
                    const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                    if (dist2 < connectionDistance) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        const alpha = 1 - dist2 / connectionDistance;
                        ctx.strokeStyle = `rgba(100, 149, 237, ${alpha * 0.2})`;
                        ctx.stroke();
                    }
                }
            });

            animationFrameId = requestAnimationFrame(draw);
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        initParticles();
        draw();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, [mousePos]);

    const handleMouseMove = (e: React.MouseEvent) => {
        setMousePos({ x: e.clientX, y: e.clientY });
    };

    return (
        <div className="relative w-full h-screen overflow-hidden bg-white text-slate-900" onMouseMove={handleMouseMove}>
            {/* Canvas Background */}
            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />

            {/* Navigation */}
            <nav className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10">
                <div className="flex items-center gap-2 font-bold text-xl tracking-tighter">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                        <Zap size={20} fill="currentColor" />
                    </div>
                    InkBlob
                </div>
                <div className="hidden md:flex gap-8 text-sm font-medium text-slate-600">
                    <a href="#" className="hover:text-blue-600 transition-colors">Product</a>
                    <a href="#" className="hover:text-blue-600 transition-colors">Security</a>
                    <a href="#" className="hover:text-blue-600 transition-colors">Roadmap</a>
                </div>
                <div>
                    {/* Placeholder for potential secondary action */}
                </div>
            </nav>

            {/* Hero Content */}
            <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-wider mb-6 border border-blue-100">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                    Live on Sui Testnet
                </div>

                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 text-slate-900 max-w-4xl leading-tight">
                    Experience liftoff with <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                        Decentralized Notes
                    </span>
                </h1>

                <p className="text-lg md:text-xl text-slate-500 max-w-2xl mb-10 leading-relaxed">
                    Secure, encrypted, and unstoppable. InkBlob leverages Sui and Walrus to give you a notebook that truly belongs to you.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="transform hover:scale-105 transition-transform duration-200">
                        <ConnectButton className="!bg-slate-900 !text-white !px-8 !py-4 !rounded-full !font-bold !text-lg hover:!bg-slate-800 transition-all shadow-lg hover:shadow-xl" />
                    </div>
                    <button className="px-8 py-3 rounded-full bg-white text-slate-700 font-bold border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center gap-2 shadow-sm">
                        Learn more <ArrowRight size={18} />
                    </button>
                </div>

                {/* Features Grid (Bottom) */}
                <div className="absolute bottom-10 left-0 w-full px-6 hidden md:flex justify-center gap-12 text-slate-400 text-sm font-medium">
                    <div className="flex items-center gap-2">
                        <Shield size={16} /> End-to-End Encrypted
                    </div>
                    <div className="flex items-center gap-2">
                        <Globe size={16} /> Decentralized Storage
                    </div>
                    <div className="flex items-center gap-2">
                        <Zap size={16} /> Instant Sync
                    </div>
                </div>
            </div>
        </div>
    );
};
