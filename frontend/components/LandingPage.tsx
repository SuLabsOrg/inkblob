import React, { useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit';
import { ArrowRight } from 'lucide-react';

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
        const particleCount = 60; // Reduced for cleaner look
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
                    vx: (Math.random() - 0.5) * 0.3, // Slower movement
                    vy: (Math.random() - 0.5) * 0.3,
                    size: Math.random() * 2 + 1,
                    alpha: Math.random() * 0.6 + 0.4, // Increased opacity
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
                    p.vx -= (dx / dist) * force * 0.02;
                    p.vy -= (dy / dist) * force * 0.02;
                }

                // Draw particle
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(216, 180, 254, ${p.alpha})`; // Lighter Purple (Purple-300) for contrast
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
                        ctx.strokeStyle = `rgba(216, 180, 254, ${alpha * 0.3})`; // Increased connection opacity
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
        <div className="relative w-full h-screen overflow-hidden bg-[#0a0a0a] text-white" onMouseMove={handleMouseMove}>
            {/* Canvas Background */}
            <canvas
                ref={canvasRef}
                className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-50"
            />

            {/* Logo - Top Left */}
            <div className="absolute top-8 left-8 z-20">
                <img src="/logo.png" alt="InkBlob Logo" className="w-12 h-12 object-contain" />
            </div>

            {/* Hero Content */}
            <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
                <div className="mb-8 relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                    <img src="/logo.png" alt="InkBlob Logo" className="relative w-32 h-32 object-contain drop-shadow-2xl" />
                </div>

                <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50">
                    InkBlob
                </h1>

                <p className="text-lg md:text-xl text-zinc-400 max-w-xl mb-12 leading-relaxed font-light">
                    Your decentralized sanctuary for thoughts. <br />
                    Encrypted. Permanent. Yours.
                </p>

                <div className="flex flex-col items-center gap-6">
                    <div className="transform hover:scale-105 transition-transform duration-300">
                        <ConnectButton className="!bg-white !text-black !px-8 !py-3 !rounded-full !font-bold !text-lg hover:!bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]" />
                    </div>

                    <a href="https://github.com/SuLabsOrg/inkblob" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white transition-colors text-sm flex items-center gap-1">
                        View on GitHub <ArrowRight size={14} />
                    </a>
                </div>
            </div>
        </div>
    );
};
