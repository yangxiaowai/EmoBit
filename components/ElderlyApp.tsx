
import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { SimulationType, SystemStatus, MemoryPhoto } from '../types';
import { Mic, Battery, Wifi, Signal, Info, ChevronLeft, ChevronRight, Image as ImageIcon, Volume2, X, CloudSun, Loader2, Navigation, ScanLine, Pill, CheckCircle, ArrowUp, ArrowLeft, ArrowRight, MapPin, Camera, User, ScanFace, Box, AlertCircle, MicOff, Sparkles, Settings, Brain } from 'lucide-react';
import { speechService, SpeechRecognitionResult } from '../services/speechService';
import { mapService, RouteResult, RouteStep } from '../services/mapService';
import { memoryService, LocationEvent } from '../services/memoryService';
import { VoiceService } from '../services/api';
import { edgeTTSService } from '../services/ttsService';
import { voiceSelectionService } from '../services/voiceSelectionService';
import { voiceCloneService } from '../services/voiceCloneService';
import { aiService, AIResponse } from '../services/aiService';
import { wanderingService } from '../services/wanderingService';
import { medicationService } from '../services/medicationService';
import { cognitiveService } from '../services/cognitiveService';
import AvatarCreator from './AvatarCreator';
import ARNavigationOverlay from './ARNavigationOverlay';
import WanderingAlert from './WanderingAlert';
import MedicationReminder from './MedicationReminder';
import CognitiveReport from './CognitiveReport';

interface ElderlyAppProps {
    status: SystemStatus;
    simulation: SimulationType;
}

// --- Data ---
const MOCK_MEMORIES: MemoryPhoto[] = [
    { id: '1', url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=600&auto=format&fit=crop', date: '1982年 秋', location: '人民公园', story: '这是您和奶奶在人民公园的合影。那时候刚买了第一台胶片相机...', tags: ['家人'] },
    { id: '2', url: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?q=80&w=600&auto=format&fit=crop', date: '1995年 春节', location: '老家院子', story: '这张是大年初一的全家福。大家围在一起包饺子...', tags: ['春节'] },
    { id: '3', url: 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?q=80&w=600&auto=format&fit=crop', date: '2010年 夏', location: '上海世博会', story: '这是咱们一家去上海看世博会。中国馆真的好壮观...', tags: ['旅行'] }
];

// --- 3D Avatar Component (Real-time Render) ---
const CuteAvatar3D = ({ isTalking, isListening, isThinking }: { isTalking: boolean, isListening: boolean, isThinking?: boolean }) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const stateRef = useRef({ isTalking, isListening, isThinking: !!isThinking });
    stateRef.current = { isTalking, isListening, isThinking: !!isThinking };

    useEffect(() => {
        const mount = mountRef.current;
        if (!mount) return;

        // 确保唯一 canvas：清空可能残留的子节点（如 Strict Mode 或清理未完全执行）
        while (mount.firstChild) mount.removeChild(mount.firstChild);

        // 1. Setup Scene
        const scene = new THREE.Scene();
        
        // --- Background Decor (Clouds) ---
        const bgGroup = new THREE.Group();
        scene.add(bgGroup);

        const createCloud = (x: number, y: number, z: number, scale: number) => {
            const cloud = new THREE.Group();
            const cloudMat = new THREE.MeshStandardMaterial({ 
                color: 0xffffff, 
                roughness: 0.9, 
                flatShading: true, 
                transparent: true, 
                opacity: 0.6 
            });
            
            const g1 = new THREE.IcosahedronGeometry(0.5, 0);
            const m1 = new THREE.Mesh(g1, cloudMat);
            m1.position.x = -0.4;
            cloud.add(m1);
            
            const g2 = new THREE.IcosahedronGeometry(0.6, 0);
            const m2 = new THREE.Mesh(g2, cloudMat);
            cloud.add(m2);

            const g3 = new THREE.IcosahedronGeometry(0.5, 0);
            const m3 = new THREE.Mesh(g3, cloudMat);
            m3.position.x = 0.4;
            cloud.add(m3);

            cloud.position.set(x, y, z);
            cloud.scale.setScalar(scale);
            return cloud;
        };

        const cloud1 = createCloud(-2.5, 2, -3, 0.8);
        bgGroup.add(cloud1);
        const cloud2 = createCloud(2.5, 0, -4, 0.6);
        bgGroup.add(cloud2);
        const cloud3 = createCloud(-2, -1.5, -3, 0.5);
        bgGroup.add(cloud3);

        // --- Floating Particles ---
        const particleCount = 8;
        const particles: THREE.Mesh[] = [];
        const particleGeo = new THREE.OctahedronGeometry(0.1, 0);
        const particleMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.6 });
        
        for(let i=0; i<particleCount; i++) {
            const p = new THREE.Mesh(particleGeo, particleMat);
            p.position.set(
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 2 - 1
            );
            p.scale.setScalar(Math.random() * 0.5 + 0.5);
            bgGroup.add(p);
            particles.push(p);
        }
        
        const camera = new THREE.PerspectiveCamera(50, 300 / 400, 0.1, 1000);
        camera.position.z = 5;
        camera.position.y = 0.5;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(300, 400); 
        renderer.setPixelRatio(window.devicePixelRatio);
        mount.appendChild(renderer.domElement);

        // 2. Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.1); 
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
        dirLight.position.set(5, 5, 5);
        scene.add(dirLight);
        
        const frontLight = new THREE.DirectionalLight(0xffeadd, 0.6); 
        frontLight.position.set(0, 2, 5);
        scene.add(frontLight);

        const backLight = new THREE.DirectionalLight(0xffeeb1, 0.5);
        backLight.position.set(-5, 5, -5);
        scene.add(backLight);

        // 3. Character Group
        const characterGroup = new THREE.Group();
        scene.add(characterGroup);

        // --- Materials ---
        const skinMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffe5d8, // Warm Fair Skin Tone
            emissive: 0x5a3a30,
            emissiveIntensity: 0.05,
            roughness: 0.45,
            metalness: 0.0, 
            clearcoat: 0.1,
            reflectivity: 0.5
        });

        const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 });
        const eyebrowMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.9 });
        const blushMaterial = new THREE.MeshStandardMaterial({ color: 0xff8a8a, roughness: 1, transparent: true, opacity: 0.4 });
        const noseMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffd1c2, roughness: 0.5, metalness: 0 }); 
        const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0xf43f5e, roughness: 0.5 });
        
        // New Accessories Materials
        const scarfMaterial = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.8 }); // Amber Scarf
        const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x2d241e, roughness: 1.0 }); // Dark Brown Hair (Back to fluffiness)

        // --- Body Parts ---
        
        // Head
        const headGeo = new THREE.SphereGeometry(1.2, 32, 32);
        const head = new THREE.Mesh(headGeo, skinMaterial);
        characterGroup.add(head);

        // Body
        const bodyGeo = new THREE.SphereGeometry(0.8, 32, 32);
        const body = new THREE.Mesh(bodyGeo, skinMaterial);
        body.position.y = -1.5;
        characterGroup.add(body);

        // --- Accessories ---

        // 1. Scarf (Fills gap between head and body)
        const scarfGeo = new THREE.TorusGeometry(0.85, 0.25, 16, 32);
        const scarf = new THREE.Mesh(scarfGeo, scarfMaterial);
        scarf.rotation.x = Math.PI / 2;
        scarf.position.y = -1.1;
        characterGroup.add(scarf);

        // 2. Fluffy Hair (Back to Original Puffy Style)
        const hairGroup = new THREE.Group();
        head.add(hairGroup); // Move with head

        const hairPuffGeo = new THREE.SphereGeometry(0.45, 16, 16);
        
        // Helper to add hair puffs
        const createPuff = (x: number, y: number, z: number, s: number) => {
             const m = new THREE.Mesh(hairPuffGeo, hairMaterial);
             m.position.set(x, y, z);
             m.scale.setScalar(s);
             hairGroup.add(m);
        };

        // Top Main Cloud
        createPuff(0, 1.35, 0, 1.9);
        
        // Side Clouds (Upper)
        createPuff(-0.8, 1.1, 0.3, 1.4);
        createPuff(0.8, 1.1, 0.3, 1.4);
        
        // Side Clouds (Lower - kept away from face to not block eyes)
        createPuff(-1.1, 0.7, -0.2, 1.3);
        createPuff(1.1, 0.7, -0.2, 1.3);

        // Back Volume
        createPuff(0, 0.6, -0.9, 2.0);
        createPuff(-0.7, 1.0, -0.6, 1.5);
        createPuff(0.7, 1.0, -0.6, 1.5);

        // Front subtle volume (bangs) - kept high
        createPuff(0, 1.35, 0.5, 1.1); 

        // --- Face Features ---

        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.12, 16, 16);
        const leftEye = new THREE.Mesh(eyeGeo, blackMaterial);
        leftEye.position.set(-0.4, 0.15, 1.08);
        leftEye.scale.set(1, 1.4, 1);
        head.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeo, blackMaterial);
        rightEye.position.set(0.4, 0.15, 1.08);
        rightEye.scale.set(1, 1.4, 1);
        head.add(rightEye);

        // Eyebrows
        const browGeo = new THREE.CapsuleGeometry(0.03, 0.25, 4, 8);
        const leftBrow = new THREE.Mesh(browGeo, eyebrowMaterial);
        leftBrow.position.set(-0.4, 0.45, 1.12);
        leftBrow.rotation.set(0, 0, 1.7);
        head.add(leftBrow);

        const rightBrow = new THREE.Mesh(browGeo, eyebrowMaterial);
        rightBrow.position.set(0.4, 0.45, 1.12);
        rightBrow.rotation.set(0, 0, -1.7);
        head.add(rightBrow);

        // Nose
        const noseGeo = new THREE.SphereGeometry(0.1, 16, 16);
        const nose = new THREE.Mesh(noseGeo, noseMaterial);
        nose.position.set(0, 0.0, 1.18);
        head.add(nose);

        // Mouth
        const mouthGeo = new THREE.TorusGeometry(0.06, 0.03, 8, 16, Math.PI * 2); 
        const mouth = new THREE.Mesh(mouthGeo, mouthMaterial);
        mouth.position.set(0, -0.25, 1.14);
        // Initial neutral state
        mouth.scale.set(1, 0.5, 1);
        head.add(mouth);

        // Blush
        const blushGeo = new THREE.CircleGeometry(0.2, 32);
        const leftBlush = new THREE.Mesh(blushGeo, blushMaterial);
        leftBlush.position.set(-0.7, -0.1, 1.0);
        leftBlush.rotation.y = -0.5;
        head.add(leftBlush);

        const rightBlush = new THREE.Mesh(blushGeo, blushMaterial);
        rightBlush.position.set(0.7, -0.1, 1.0);
        rightBlush.rotation.y = 0.5;
        head.add(rightBlush);

        // Ears
        const earGeo = new THREE.SphereGeometry(0.25, 32, 32);
        const leftEar = new THREE.Mesh(earGeo, skinMaterial);
        leftEar.position.set(-1.18, 0.1, 0);
        leftEar.scale.z = 0.5;
        head.add(leftEar);
        
        const rightEar = new THREE.Mesh(earGeo, skinMaterial);
        rightEar.position.set(1.18, 0.1, 0);
        rightEar.scale.z = 0.5;
        head.add(rightEar);
        

        // 4. Animation Loop
        let frameId: number;
        const clock = new THREE.Clock();
        
        const animate = () => {
            frameId = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();

            // Background Animation
            cloud1.position.y = 2 + Math.sin(t * 0.3) * 0.2;
            cloud1.rotation.y = Math.sin(t * 0.1) * 0.1;
            
            cloud2.position.y = 0 + Math.sin(t * 0.4 + 2) * 0.2;
            cloud2.rotation.z = Math.sin(t * 0.05) * 0.05;

            cloud3.position.y = -1.5 + Math.sin(t * 0.2 + 4) * 0.1;

            // Particles Animation
            particles.forEach((p, i) => {
                p.position.y += Math.sin(t + i) * 0.005;
                p.rotation.x += 0.01;
                p.rotation.y += 0.01;
            });

            // Character Animation
            characterGroup.position.y = Math.sin(t * 1.5) * 0.05;
            body.scale.x = 1 + Math.sin(t * 1.5) * 0.01;

            characterGroup.rotation.y = Math.sin(t * 0.5) * 0.08; 
            characterGroup.rotation.x = Math.sin(t * 0.3) * 0.03;

            // Scarf subtle movement
            scarf.rotation.z = Math.sin(t * 1.5) * 0.05;

            // Hair bounce effect
            hairGroup.scale.y = 1 + Math.sin(t * 3) * 0.02;

            const { isTalking: talking, isListening: listening, isThinking: thinking } = stateRef.current;
            if (talking) {
                const talkFreq = 18;
                const mouthOpenAmount = (Math.sin(t * talkFreq) + Math.sin(t * talkFreq * 0.8)) * 0.5;
                head.position.y = Math.sin(t * 12) * 0.02;
                const mouthScaleY = 0.5 + Math.max(0, mouthOpenAmount + 0.3) * 0.8; 
                const mouthScaleX = 1.0 - Math.max(0, mouthOpenAmount) * 0.15;
                mouth.scale.set(mouthScaleX, mouthScaleY, 1);
            } else {
                head.position.y = THREE.MathUtils.lerp(head.position.y, 0, 0.1);
                mouth.scale.set(1, 0.5, 1);
            }

            if (listening || thinking) {
                characterGroup.rotation.z = THREE.MathUtils.lerp(characterGroup.rotation.z, 0.1, 0.1);
                characterGroup.rotation.x = THREE.MathUtils.lerp(characterGroup.rotation.x, 0.15, 0.1);
            } else {
                characterGroup.rotation.z = THREE.MathUtils.lerp(characterGroup.rotation.z, 0, 0.1);
                characterGroup.rotation.x = THREE.MathUtils.lerp(characterGroup.rotation.x, 0, 0.1);
            }

            if (Math.random() > 0.995) {
                leftEye.scale.y = 0.1;
                rightEye.scale.y = 0.1;
            } else {
                leftEye.scale.y += (1.4 - leftEye.scale.y) * 0.2;
                rightEye.scale.y += (1.4 - rightEye.scale.y) * 0.2;
            }

            renderer.render(scene, camera);
        };

        animate();

        // Cleanup
        return () => {
            cancelAnimationFrame(frameId);
            try {
                if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
            } catch (_) { /* already removed */ }
            // Dispose geometries
            headGeo.dispose();
            bodyGeo.dispose();
            scarfGeo.dispose();
            hairPuffGeo.dispose();
            eyeGeo.dispose();
            browGeo.dispose();
            noseGeo.dispose();
            mouthGeo.dispose();
            blushGeo.dispose();
            earGeo.dispose();
            particleGeo.dispose();
            // Dispose materials
            skinMaterial.dispose();
            blackMaterial.dispose();
            eyebrowMaterial.dispose();
            blushMaterial.dispose();
            noseMaterial.dispose();
            mouthMaterial.dispose();
            scarfMaterial.dispose();
            hairMaterial.dispose();
            particleMat.dispose();
            // Traverse scene to dispose all materials and geometries
            scene.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach((mat) => mat.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                }
            });
            renderer.dispose();
        };
    }, []); // 仅挂载时创建，避免重复 canvas；状态通过 stateRef 更新

    return <div ref={mountRef} className="w-[300px] h-[400px] cursor-pointer active:scale-95 transition-transform" />;
};

// --- Sub-Components (Full Screen Scenarios) ---

// 1. AR Navigation Scenario (Enhanced HUD with Real Route Data)
interface ARNavigationFlowProps {
    step: number;
    routeData?: RouteResult | null;
    destination?: string;
}

const ARNavigationFlow = ({ step, routeData, destination = '天安门广场' }: ARNavigationFlowProps) => {
    // 使用真实路线数据或回退到模拟数据
    const getStepIcon = (action: RouteStep['action'] | undefined) => {
        switch (action) {
            case 'left': return <ArrowLeft size={64} className="animate-bounce-left" />;
            case 'right': return <ArrowRight size={64} className="animate-bounce-right" />;
            case 'arrive': return <MapPin size={64} className="animate-bounce" />;
            case 'start': return <Navigation size={64} />;
            default: return <ArrowUp size={64} className="animate-bounce-up" />;
        }
    };

    // 使用真实路线数据构建指令
    const buildInstructions = () => {
        if (routeData?.success && routeData.steps.length > 0) {
            const steps = [
                { text: "正在规划路线...", sub: "请稍候", icon: <Loader2 className="animate-spin" size={64} /> },
                ...routeData.steps.slice(0, 4).map((s) => ({
                    text: s.instruction || `${s.action === 'left' ? '左转' : s.action === 'right' ? '右转' : '直行'}`,
                    sub: `距离 ${mapService.formatDistance(s.distance)}`,
                    icon: getStepIcon(s.action),
                })),
                { text: "即将到达目的地", sub: destination, icon: <MapPin size={64} className="animate-bounce" /> },
            ];
            return steps;
        }
        // 回退到默认模拟数据
        return [
            { text: "正在定位...", sub: "请扫描周围环境", icon: <Loader2 className="animate-spin" size={64} /> },
            { text: "前方路口左转", sub: "距离 50 米", icon: <ArrowLeft size={64} className="animate-bounce-left" /> },
            { text: "沿大路直行", sub: "距离 300 米", icon: <ArrowUp size={64} className="animate-bounce-up" /> },
            { text: "即将到达目的地", sub: destination, icon: <MapPin size={64} className="animate-bounce" /> },
        ];
    };

    const instructions = buildInstructions();
    const current = instructions[Math.min(step, instructions.length - 1)];
    const bgImage = step === 1
        ? "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?q=80&w=800&auto=format&fit=crop"
        : "https://images.unsplash.com/photo-1597022227183-49d7f646098b?q=80&w=800&auto=format&fit=crop";

    // 路线概览信息
    const routeInfo = routeData?.success ? {
        distance: mapService.formatDistance(routeData.distance),
        duration: mapService.formatDuration(routeData.duration),
    } : null;

    return (
        <div className="absolute inset-0 z-50 bg-black text-white flex flex-col relative overflow-hidden animate-fade-in font-sans">
            {/* AR Background */}
            <div className="absolute inset-0">
                <img src={bgImage} className="w-full h-full object-cover opacity-80" alt="AR View" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60"></div>
            </div>

            {/* HUD Header */}
            <div className="relative z-10 px-6 pt-12 flex justify-between items-start">
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20">
                    <p className="text-[10px] text-white/70 uppercase">目的地</p>
                    <p className="font-bold text-lg">{destination}</p>
                    {routeInfo && (
                        <p className="text-xs text-white/60 mt-1">{routeInfo.distance} · {routeInfo.duration}</p>
                    )}
                </div>
                <div className="w-12 h-12 bg-emerald-500/20 backdrop-blur rounded-full flex items-center justify-center border border-emerald-400/50 animate-pulse">
                    <Navigation size={24} className="text-emerald-400" />
                </div>
            </div>

            {/* AR Elements (Center) */}
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
                {step > 0 && (
                    <div className="bg-indigo-600/80 backdrop-blur p-6 rounded-[2rem] shadow-[0_0_50px_rgba(79,70,229,0.5)] border-4 border-white/30 transform transition-all duration-500">
                        {current.icon}
                    </div>
                )}

                {/* 3D Path visualization */}
                {step >= 1 && step < instructions.length - 1 && (
                    <div className="absolute bottom-0 w-32 h-64 bg-gradient-to-t from-indigo-500/50 to-transparent transform perspective-3d rotate-x-60"></div>
                )}
            </div>

            {/* Bottom Instruction Panel */}
            <div className="relative z-10 p-6 pb-12">
                <div className="bg-white/95 text-slate-900 p-6 rounded-3xl shadow-2xl animate-slide-up border border-white/50">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <h2 className="text-3xl font-black mb-1">{current.text}</h2>
                            <p className="text-slate-500 font-bold text-lg flex items-center gap-2">
                                {step === 0 ? <Loader2 size={16} className="animate-spin" /> : <Volume2 size={18} className="text-indigo-600" />}
                                {current.sub}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .animate-bounce-left { animation: bounceLeft 1s infinite; }
                .animate-bounce-up { animation: bounceUp 1s infinite; }
                .animate-bounce-right { animation: bounceRight 1s infinite; }
                @keyframes bounceLeft { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-10px); } }
                @keyframes bounceUp { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
                @keyframes bounceRight { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(10px); } }
            `}</style>
        </div>
    );
};

// 2. Medication Guide Scenario (Detailed CV Flow)
const MedicationFlow = ({ step }: { step: number }) => {
    // Step 0: Scan Prompt -> Step 1: Scanning -> Step 2: Identified -> Step 3: Action -> Step 4: Check Hand -> Step 5: Swallow Check
    const scanImage = "https://images.unsplash.com/photo-1628771065518-0d82f1938462?q=80&w=800&auto=format&fit=crop"; // Medicine Box
    const handImage = "https://images.unsplash.com/photo-1550572017-edd951aa8f72?q=80&w=800&auto=format&fit=crop"; // Pills in hand
    const drinkingImage = "https://images.unsplash.com/photo-1543506987-a2e6669c5e53?q=80&w=800&auto=format&fit=crop"; // Drinking water

    let state = { text: "", sub: "", img: scanImage, overlay: null as React.ReactNode };

    if (step === 0) {
        state = {
            text: "请拿出药盒", sub: "将药盒正面放入框内", img: scanImage,
            overlay: <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-white/50 rounded-2xl flex items-center justify-center"><ScanLine className="text-white opacity-50" size={32} /></div>
        };
    } else if (step === 1) {
        state = {
            text: "正在识别...", sub: "保持药盒稳定", img: scanImage,
            overlay: <div className="absolute inset-12 border-2 border-indigo-400 rounded-xl animate-pulse flex items-center justify-center bg-indigo-500/10"><ScanLine className="text-indigo-400 w-full h-full opacity-80 animate-ping" /></div>
        };
    } else if (step === 2) {
        state = {
            text: "识别成功：阿司匹林", sub: "100mg肠溶片", img: scanImage,
            overlay: (
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur px-4 py-2 rounded-xl border border-emerald-500 shadow-lg flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-500" />
                    <span className="font-bold text-slate-800">匹配处方</span>
                </div>
            )
        };
    } else if (step === 3) {
        state = {
            text: "请倒出 2 粒", sub: "放在手心让我看看", img: handImage,
            overlay: <div className="absolute inset-0 flex items-center justify-center"><div className="w-48 h-48 border-2 border-dashed border-yellow-400 rounded-full animate-spin-slow opacity-50"></div></div>
        };
    } else if (step === 4) {
        state = {
            text: "数量正确 (2粒)", sub: "请准备温水送服", img: handImage,
            overlay: (
                <>
                    <div className="absolute top-1/2 left-1/2 -translate-x-12 -translate-y-12 w-6 h-6 border-2 border-green-400 rounded-full"></div>
                    <div className="absolute top-1/2 left-1/2 translate-x-4 -translate-y-8 w-6 h-6 border-2 border-green-400 rounded-full"></div>
                    <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-4 py-1 rounded-full text-sm font-bold shadow-lg">Count: 2</div>
                </>
            )
        }
    } else {
        state = {
            text: "检测服药动作", sub: "请正对摄像头吞咽", img: drinkingImage,
            overlay: (
                <div className="absolute inset-0">
                    <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-40 h-40 border-2 border-indigo-400 rounded-full opacity-50"></div>
                    <div className="absolute bottom-32 left-0 right-0 text-center">
                        <div className="inline-flex items-center gap-2 bg-black/60 text-white px-3 py-1 rounded-full text-xs">
                            <ScanFace size={12} /> 动作分析中...
                        </div>
                    </div>
                </div>
            )
        };
    }

    return (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in font-sans">
            {/* Camera Feed Simulation */}
            <div className="flex-1 relative overflow-hidden bg-black">
                <img src={state.img} className="w-full h-full object-cover opacity-90" alt="Camera" />

                {/* Status Badges */}
                <div className="absolute top-4 right-4 bg-black/50 backdrop-blur text-white px-3 py-1 rounded-full text-xs font-mono flex items-center gap-2 border border-white/10">
                    <Camera size={12} className="text-red-500 animate-pulse" /> AI Vision Active
                </div>

                {state.overlay}
            </div>

            {/* Interactive Guide Panel */}
            <div className="bg-white rounded-t-[2.5rem] p-8 -mt-6 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">
                <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6"></div>
                <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 ${step === 2 || step >= 4 ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {step >= 5 ? <CheckCircle size={28} /> : <Pill size={28} />}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 mb-1">{state.text}</h2>
                        <p className="text-slate-500 font-bold flex items-center gap-2">
                            <Volume2 size={16} className="text-indigo-500" />
                            {state.sub}
                        </p>
                    </div>
                </div>

                {/* Progress Steps */}
                <div className="flex gap-2 mt-8">
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`h-2 rounded-full flex-1 transition-all duration-500 ${i <= step ? 'bg-indigo-600' : 'bg-slate-200'}`}></div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// 3. Immersive Memories Scenario (手动切换模式)
const MemoriesFlow = ({ step, onClose, onPrev, onNext }: { step: number; onClose: () => void; onPrev: () => void; onNext: () => void }) => {
    // Loop through photos based on step
    const photoIndex = step % MOCK_MEMORIES.length;
    const photo = MOCK_MEMORIES[photoIndex];
    const [isSpeaking, setIsSpeaking] = useState(false);

    // 播放当前照片的语音（用户点击播放或切换时触发）
    const playNarration = useCallback(() => {
        setIsSpeaking(true);
        const textToSpeak = `${photo.location}。${photo.story}`;
        VoiceService.speak(textToSpeak, undefined, undefined, () => setIsSpeaking(false)).catch(() => setIsSpeaking(false));
    }, [photo]);

    // 初次进入时自动播放第一张
    useEffect(() => {
        playNarration();
        return () => {
            VoiceService.stop();
        };
    }, []);

    // 切换照片时停止当前语音
    const handlePrev = () => {
        VoiceService.stop();
        setIsSpeaking(false);
        onPrev();
        setTimeout(() => {
            const prevIndex = (step - 1 + MOCK_MEMORIES.length) % MOCK_MEMORIES.length;
            const prevPhoto = MOCK_MEMORIES[prevIndex];
            setIsSpeaking(true);
            VoiceService.speak(`${prevPhoto.location}。${prevPhoto.story}`, undefined, undefined, () => setIsSpeaking(false)).catch(() => setIsSpeaking(false));
        }, 300);
    };

    const handleNext = () => {
        VoiceService.stop();
        setIsSpeaking(false);
        onNext();
        setTimeout(() => {
            const nextIndex = (step + 1) % MOCK_MEMORIES.length;
            const nextPhoto = MOCK_MEMORIES[nextIndex];
            setIsSpeaking(true);
            VoiceService.speak(`${nextPhoto.location}。${nextPhoto.story}`, undefined, undefined, () => setIsSpeaking(false)).catch(() => setIsSpeaking(false));
        }, 300);
    };

    return (
        <div className="absolute inset-0 z-50 bg-black flex flex-col animate-fade-in font-sans">
            {/* Immersive Photo (Ken Burns Effect) */}
            <div className="absolute inset-0 overflow-hidden">
                <img
                    key={photo.id}
                    src={photo.url}
                    className="w-full h-full object-cover animate-ken-burns opacity-90"
                    alt="Memory"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40"></div>
            </div>

            {/* Top Info */}
            <div className="relative z-10 px-6 pt-12 flex justify-between items-start">
                <div className="bg-black/30 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-white/80 text-xs font-bold flex items-center gap-2">
                    <ImageIcon size={12} /> 时光回忆录 ({photoIndex + 1}/{MOCK_MEMORIES.length})
                </div>

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="w-8 h-8 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 text-white hover:bg-white/20 transition-colors z-50"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Manual Navigation Buttons - Left/Right */}
            <div className="absolute inset-y-0 left-0 right-0 z-20 flex items-center justify-between px-4 pointer-events-none">
                <button
                    onClick={handlePrev}
                    className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 text-white hover:bg-white/30 transition-colors pointer-events-auto active:scale-95"
                >
                    <ChevronLeft size={24} />
                </button>
                <button
                    onClick={handleNext}
                    className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 text-white hover:bg-white/30 transition-colors pointer-events-auto active:scale-95"
                >
                    <ChevronRight size={24} />
                </button>
            </div>

            {/* Bottom Caption / Story */}
            <div className="mt-auto relative z-10 p-8 pb-16">
                <div className="mb-4 flex flex-wrap gap-2">
                    {photo.tags.map(tag => (
                        <span key={tag} className="bg-indigo-500/80 backdrop-blur px-2 py-1 rounded-md text-white text-[10px] font-bold shadow-sm">
                            #{tag}
                        </span>
                    ))}
                    <span className="text-white/60 text-xs font-mono ml-auto self-center">{photo.date}</span>
                </div>
                <h2 className="text-3xl font-black text-white mb-2 leading-tight drop-shadow-lg">{photo.location}</h2>

                {/* Narration Box */}
                <div className="bg-white/10 backdrop-blur-lg border border-white/20 p-4 rounded-2xl mt-4">
                    <p className="text-white/90 text-lg font-medium leading-relaxed drop-shadow-md">
                        "{photo.story}"
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                        <button
                            onClick={playNarration}
                            disabled={isSpeaking}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isSpeaking ? 'bg-indigo-500' : 'bg-white/20 hover:bg-white/30'}`}
                        >
                            <Volume2 size={16} className={`text-white ${isSpeaking ? 'animate-pulse' : ''}`} />
                        </button>
                        <div className="flex-1 h-8 flex items-center gap-0.5">
                            {/* Fake Waveform */}
                            {[...Array(20)].map((_, i) => (
                                <div
                                    key={i}
                                    className={`w-1 rounded-full ${isSpeaking ? 'bg-white/60 animate-wave' : 'bg-white/30'}`}
                                    style={{
                                        height: isSpeaking ? Math.random() * 20 + 5 + 'px' : '8px',
                                        animationDelay: i * 0.05 + 's'
                                    }}
                                ></div>
                            ))}
                        </div>
                        <span className="text-white/50 text-xs">{isSpeaking ? '播放中...' : '点击播放'}</span>
                    </div>
                </div>
            </div>

            <style>{`
                .animate-ken-burns { animation: kenBurns 15s ease-out infinite alternate; }
                .animate-wave { animation: wave 1s ease-in-out infinite; }
                @keyframes kenBurns { 0% { transform: scale(1); } 100% { transform: scale(1.15) translate(-2%, -2%); } }
                @keyframes wave { 0%, 100% { height: 30%; opacity: 0.5; } 50% { height: 100%; opacity: 1; } }
            `}</style>
        </div>
    );
};


// --- Main Component ---

const ElderlyApp: React.FC<ElderlyAppProps> = ({ status, simulation }) => {
    const [time, setTime] = useState<string>('');
    const [dateStr, setDateStr] = useState<string>('');

    // Scenario Flow State
    const [activeScenario, setActiveScenario] = useState<'none' | 'nav' | 'meds' | 'memory'>('none');
    const [step, setStep] = useState(0);
    const [voiceInputDisplay, setVoiceInputDisplay] = useState<string | null>(null);

    // Avatar State
    const [isTalking, setIsTalking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [aiMessage, setAiMessage] = useState("张爷爷，我在呢。有什么想聊的吗？");

    // 语音识别状态
    const [isRecording, setIsRecording] = useState(false);
    const [speechError, setSpeechError] = useState<string | null>(null);
    const [interimText, setInterimText] = useState<string>('');

    // 导航状态
    const [routeData, setRouteData] = useState<RouteResult | null>(null);
    const [navDestination, setNavDestination] = useState<string>('天安门广场');
    const [arModeActive, setArModeActive] = useState(false);  // AR实景导航模式

    // AIGC头像状态
    const [showAvatarCreator, setShowAvatarCreator] = useState(false);
    const [customAvatarUrl, setCustomAvatarUrl] = useState<string | null>(null);

    // 记忆唤醒状态
    const [memoryEvent, setMemoryEvent] = useState<LocationEvent | null>(null);

    // 认知报告状态
    const [showCognitiveReport, setShowCognitiveReport] = useState(false);

    // Auto-scroll ref
    const messagesEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [aiMessage, voiceInputDisplay, isTalking]);

    // Edge 预生成：确认音「嗯」等
    useEffect(() => {
        edgeTTSService.preload(['嗯']).catch(() => {});
    }, []);

    // 克隆常用句预拉：等待服务端模型就绪后再触发（避免过早请求导致错误）
    // 服务端会在模型加载完成后自动预加载，这里只做补充（如果前端有新的常用句）
    useEffect(() => {
        const preloadWhenReady = async () => {
            try {
                // 等待服务就绪（最多等待 5 秒）
                const maxWait = 5000;
                const start = Date.now();
                let status = await voiceCloneService.checkStatus();
                
                while (!status.modelReady && Date.now() - start < maxWait) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    status = await voiceCloneService.checkStatus();
                }
                
                if (status.modelReady) {
                    const id = voiceSelectionService.getSelectedVoiceId();
                    if (id?.startsWith('cloned_')) {
                        console.log('[ElderlyApp] 服务已就绪，补充预加载克隆常用句（服务端已自动预加载）');
                        // 服务端已自动预加载，这里只做补充（如果有新的常用句）
                        // VoiceService.preloadClonePhrases(id);
                        
                        // 可选：进入老人端时自动播放问候语（如果已选中克隆音色）
                        // 延迟 1 秒，确保服务完全就绪
                        setTimeout(() => {
                            const greeting = '你好，我是你的数字人助手';
                            VoiceService.speak(greeting, id, undefined, undefined).catch(() => {});
                        }, 1000);
                    }
                } else {
                    console.warn('[ElderlyApp] 服务未就绪，跳过预加载（服务端会自动预加载）');
                }
            } catch (error) {
                console.warn('[ElderlyApp] 预加载检查失败:', error);
            }
        };
        
        preloadWhenReady();
    }, []);

    // Clock
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setTime(now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }));
            setDateStr(now.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }));
        };
        updateTime();
        const timer = setInterval(updateTime, 1000);
        return () => clearInterval(timer);
    }, []);

    // 记忆唤醒服务订阅
    useEffect(() => {
        const unsubscribe = memoryService.subscribe((event) => {
            setMemoryEvent(event);
            const dialogue = memoryService.generateMemoryDialogue(event.anchor, '小明');
            setAiMessage(dialogue);
            setIsTalking(true);

            // 使用TTS播报
            VoiceService.speak(dialogue).catch(console.error);

            // 3秒后清除事件
            setTimeout(() => {
                setMemoryEvent(null);
                setIsTalking(false);
            }, 5000);
        });

        // 开始位置监控（可选）
        // memoryService.startWatching();

        return () => {
            unsubscribe();
            // memoryService.stopWatching();
        };
    }, []);

    // --- Logic: Handle External Simulations & Voice Triggers ---
    useEffect(() => {
        if (simulation === SimulationType.NONE) {
            setActiveScenario('none');
            setStep(0);
            setVoiceInputDisplay(null);
            setAiMessage("张爷爷，我在呢。今天天气不错。");
            return;
        }

        // Handle Voice Command Scenarios
        if (simulation === SimulationType.VOICE_NAV_START) {
            triggerVoiceCommand("我要去天安门", 'nav', "好的，正在为您开启 AR 导航。");
        } else if (simulation === SimulationType.VOICE_MEMORY_START) {
            triggerVoiceCommand("听听照片回忆", 'memory', "没问题，让我们一起翻翻老照片。");
        } else if (simulation === SimulationType.VOICE_MEDS_START) {
            triggerVoiceCommand("这药怎么吃？", 'meds', "我来帮您看看。请把药盒拿出来。");
        }
        // Handle Emergency Scenarios (Existing)
        else if (simulation === SimulationType.FALL || simulation === SimulationType.WANDERING || simulation === SimulationType.MEDICATION) {
            setActiveScenario('none');
        }

    }, [simulation]);

    // 解析语音命令，识别意图
    const parseVoiceCommand = useCallback((text: string): {
        intent: 'nav' | 'meds' | 'memory' | 'chat' | 'unknown';
        destination?: string;
        response?: string;
    } => {
        const lowerText = text.toLowerCase();
        const now = new Date();

        // 导航意图
        const navKeywords = ['去', '到', '导航', '怎么走', '带我去', '想去'];
        if (navKeywords.some(k => lowerText.includes(k))) {
            const destinations = ['天安门', '医院', '超市', '公园', '银行', '药店', '家', '儿子家', '女儿家'];
            const found = destinations.find(d => lowerText.includes(d));
            return { intent: 'nav', destination: found || '天安门广场' };
        }

        // 药物意图
        const medKeywords = ['药', '吃药', '服药', '怎么吃', '用药'];
        if (medKeywords.some(k => lowerText.includes(k))) {
            return { intent: 'meds' };
        }

        // 回忆意图
        const memoryKeywords = ['照片', '回忆', '以前', '老照片', '看看'];
        if (memoryKeywords.some(k => lowerText.includes(k))) {
            return { intent: 'memory' };
        }

        // === 日常对话意图 ===

        // 日期/星期相关
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekday = weekdays[now.getDay()];
        if (lowerText.includes('星期') || lowerText.includes('周几') || lowerText.includes('礼拜')) {
            return {
                intent: 'chat',
                response: `今天是星期${weekday}，${now.getMonth() + 1}月${now.getDate()}号。`
            };
        }
        if (lowerText.includes('几号') || lowerText.includes('日期') || lowerText.includes('今天')) {
            return {
                intent: 'chat',
                response: `今天是${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}号，星期${weekday}。`
            };
        }

        // 时间相关
        if (lowerText.includes('几点') || lowerText.includes('时间') || lowerText.includes('现在')) {
            const hours = now.getHours();
            const minutes = now.getMinutes();
            const timeStr = `${hours}点${minutes > 0 ? minutes + '分' : '整'}`;
            return {
                intent: 'chat',
                response: `现在是${timeStr}。`
            };
        }

        // 天气相关
        if (lowerText.includes('天气') || lowerText.includes('冷') || lowerText.includes('热') || lowerText.includes('下雨')) {
            return {
                intent: 'chat',
                response: '今天天气不错，24度，晴朗。出门记得戴帽子防晒哦~'
            };
        }

        // 问候相关
        if (lowerText.includes('你好') || lowerText.includes('早上好') || lowerText.includes('晚上好')) {
            const hour = now.getHours();
            const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
            return {
                intent: 'chat',
                response: `${greeting}，张爷爷！今天状态怎么样？`
            };
        }

        // 吃饭相关
        if (lowerText.includes('吃') || lowerText.includes('饭') || lowerText.includes('饿')) {
            const hour = now.getHours();
            if (hour >= 11 && hour <= 13) {
                return { intent: 'chat', response: '到中午了，该吃午饭啦！要不要我提醒儿子给您送饭？' };
            } else if (hour >= 17 && hour <= 19) {
                return { intent: 'chat', response: '到晚饭时间了，今天想吃什么？' };
            }
            return { intent: 'chat', response: '好的，我帮您记着，到饭点提醒您吃饭。' };
        }

        // 身体状态相关
        if (lowerText.includes('累') || lowerText.includes('困') || lowerText.includes('不舒服')) {
            return {
                intent: 'chat',
                response: '您累了就休息一下吧。要不要我帮您联系家人？'
            };
        }

        // 感谢相关
        if (lowerText.includes('谢谢') || lowerText.includes('多谢')) {
            return {
                intent: 'chat',
                response: '不客气，能帮到您是我的荣幸！'
            };
        }

        return { intent: 'unknown' };
    }, []);

    // 处理语音识别结果 - 使用AI大模型
    const handleSpeechResult = useCallback(async (result: SpeechRecognitionResult) => {
        if (!result.isFinal) {
            setInterimText(result.text);
            return;
        }

        setInterimText('');
        setIsRecording(false);
        speechService.stopRecognition();
        setIsListening(false);

        setVoiceInputDisplay(result.text);
        setIsThinking(true);
        edgeTTSService.speak('嗯', 'xiaoxiao').catch(() => {});

        try {
            const response = await aiService.chat(result.text);

            setVoiceInputDisplay(null);
            setAiMessage(response.text);
            setIsThinking(false);
            setIsTalking(true);

            VoiceService.speakSegments(response.text, undefined, undefined, () => setIsTalking(false)).catch(() => setIsTalking(false));

            // 记录对话用于认知评估
            cognitiveService.recordConversation(result.text, response.text);

            if (response.shouldTriggerAction) {
                setTimeout(() => {
                    switch (response.shouldTriggerAction) {
                        case 'nav':
                            const destMatch = result.text.match(/去(.+?)(?:怎么走|$)/);
                            const destination = destMatch?.[1] || '天安门广场';
                            setNavDestination(destination);
                            mapService.planWalkingRoute('北京市', destination).then(setRouteData);
                            setActiveScenario('nav');
                            setStep(0);
                            break;
                        case 'meds':
                            setActiveScenario('meds');
                            setStep(0);
                            break;
                        case 'memory':
                            setActiveScenario('memory');
                            setStep(0);
                            break;
                    }
                }, 2500);
            }
        } catch (error) {
            console.error('AI服务错误:', error);
            setIsThinking(false);
            setVoiceInputDisplay(null);
            setAiMessage('抱歉，我没太听清楚，您能再说一遍吗？');
            setIsTalking(true);
            VoiceService.speakSegments('抱歉，我没太听清楚，您能再说一遍吗？', undefined, undefined, () => setIsTalking(false)).catch(() => setIsTalking(false));
        }
    }, []);

    // 开始/停止语音识别
    const toggleRecording = useCallback(async () => {
        if (isRecording) {
            speechService.stopRecognition();
            setIsRecording(false);
            setIsListening(false);
            return;
        }

        try {
            setSpeechError(null);
            setIsRecording(true);
            setIsListening(true);

            await speechService.startRecognition(
                handleSpeechResult,
                (error) => {
                    console.error('语音识别错误:', error);
                    setSpeechError(error.message);
                    setIsRecording(false);
                    setIsListening(false);
                }
            );
        } catch (error) {
            console.error('启动语音识别失败:', error);
            setSpeechError('无法启动语音识别');
            setIsRecording(false);
            setIsListening(false);
        }
    }, [isRecording, handleSpeechResult]);

    // Helper to trigger voice command flow (used by both real recognition and simulation)
    const triggerVoiceCommand = useCallback((userText: string, targetScenario: 'nav' | 'meds' | 'memory', aiResponse: string) => {
        // 1. Reset
        setActiveScenario('none');
        setStep(0);
        setIsRecording(false);
        speechService.stopRecognition();

        // 2. Display User Voice Input
        setVoiceInputDisplay(userText);
        setIsListening(true);

        // 3. AI Processes (Reduced delay)
        setTimeout(() => {
            setIsListening(false);
            setVoiceInputDisplay(null);
            setAiMessage(aiResponse);
            setIsTalking(true);

            // 4. AI Finishes talking and Switches UI (Reduced delay)
            setTimeout(() => {
                setIsTalking(false);
                setActiveScenario(targetScenario);
            }, 800); // Reduced from 2000
        }, 600); // Reduced from 1500
    }, []);

    // --- Logic: Scenario Auto-Progression (The 3-Second Rule) ---
    useEffect(() => {
        let interval: any;
        if (activeScenario !== 'none' && activeScenario !== 'memory') {
            interval = setInterval(() => {
                setStep((prev) => prev + 1);
            }, 3500); // 3.5s per step
        }
        return () => clearInterval(interval);
    }, [activeScenario]);


    // --- Render ---

    return (
        <div className="flex items-center justify-center h-full py-8">
            <div className="relative w-[360px] h-[720px] bg-black rounded-[3rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] border-[8px] border-slate-800 overflow-hidden ring-1 ring-slate-900/5 select-none font-sans">

                {/* Status Bar */}
                <div className="absolute top-0 left-0 right-0 h-10 z-[60] flex items-center justify-between px-6 pt-2 text-white text-xs font-medium pointer-events-none mix-blend-difference">
                    <span>{time}</span>
                    <div className="flex items-center gap-1.5"><Signal size={12} /><Wifi size={12} /><Battery size={14} /></div>
                </div>

                {/* --- SCENARIO LAYERS --- */}
                {activeScenario === 'nav' && <ARNavigationFlow step={step} routeData={routeData} destination={navDestination} />}
                {activeScenario === 'meds' && <MedicationFlow step={step} />}
                {activeScenario === 'memory' && (
                    <MemoriesFlow
                        step={step}
                        onClose={() => {
                            setActiveScenario('none');
                            VoiceService.stop();
                        }}
                        onPrev={() => setStep(prev => Math.max(0, prev - 1))}
                        onNext={() => setStep(prev => prev + 1)}
                    />
                )}

                {/* --- HOME SCREEN (3D Avatar) --- */}
                <div className={`w-full h-full flex flex-col relative transition-all duration-700 overflow-hidden bg-gradient-to-b from-indigo-50 to-white ${activeScenario !== 'none' ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'}`}>

                    {/* Header */}
                    <div className="w-full px-8 pt-14 pb-2 flex justify-between items-end relative z-10 animate-fade-in-up shrink-0">
                        <div className="flex flex-col">
                            <span className="text-5xl font-black text-slate-800 tracking-tighter leading-none">{time}</span>
                            <span className="text-sm font-bold text-slate-500 mt-2 pl-1 tracking-widest uppercase">{dateStr}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-3xl font-black text-slate-800">24°</span>
                            <CloudSun size={32} className="text-amber-500" />
                        </div>
                    </div>

                    {/* 单个动态 3D 数字人居中（仅此一处渲染，无静态重复） */}
                    <div className="flex-1 flex items-center justify-center relative min-h-0 -mt-8 overflow-hidden">
                        <div className="relative flex items-center justify-center group cursor-pointer" onClick={() => setShowAvatarCreator(true)}>
                            <div className="transform scale-90 shrink-0">
                                <CuteAvatar3D 
                                    isTalking={isTalking} 
                                    isListening={isListening}
                                    isThinking={isThinking}
                                />
                            </div>
                            {/* Platform Shadow */}
                            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-40 h-8 bg-black/10 rounded-[100%] blur-md transform scale-x-150 z-[-1] animate-shadow-breath" />
                        </div>

                        {/* 警告状态指示 */}
                        {status === SystemStatus.WARNING && (
                            <div className="absolute top-4 right-6 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center animate-pulse z-50">
                                <AlertCircle size={14} className="text-white" />
                            </div>
                        )}

                        {/* 记忆唤醒提示 */}
                        {memoryEvent && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-indigo-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-bounce whitespace-nowrap z-50">
                                📍 {memoryEvent.anchor.name}
                            </div>
                        )}
                    </div>

                    {/* 紧凑对话条：AI 陪伴助手 + 创建头像，位于导航栏上方 */}
                    <div className="shrink-0 px-4 pb-2 relative z-10">
                        <div className="bg-white/80 backdrop-blur-xl py-3 px-4 rounded-2xl shadow-sm border border-white/50 flex items-center gap-3 min-h-[56px]">
                            <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold uppercase tracking-wider flex-shrink-0">
                                {isListening && <Mic size={12} className="animate-pulse" />}
                                {isThinking && <Loader2 size={12} className="animate-spin" />}
                                {!isListening && !isThinking && <Volume2 size={12} />}
                                {isListening ? "正在聆听..." : isThinking ? "思考中..." : "AI 陪伴助手"}
                            </div>
                            <div className="flex-1 min-w-0 overflow-hidden">
                                {voiceInputDisplay ? (
                                    <p className="text-slate-800 text-sm font-bold truncate">"{voiceInputDisplay}"</p>
                                ) : (
                                    <p className="text-slate-700 text-sm font-medium truncate">{aiMessage}</p>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                            <button
                                onClick={() => setShowAvatarCreator(true)}
                                className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full shadow flex items-center justify-center text-white hover:scale-110 transition-transform flex-shrink-0"
                                title="创建我的数字分身"
                            >
                                <Sparkles size={14} />
                            </button>
                        </div>
                    </div>

                    {/* 导航栏：相册 / 麦克风 / 服药 — 固定在屏幕底部 */}
                    {activeScenario === 'none' && (
                        <div className="absolute bottom-0 left-0 right-0 pt-3 pb-6 px-4 bg-gradient-to-t from-white/30 to-transparent z-40">
                            <div className="h-20 bg-white/20 backdrop-blur-2xl rounded-3xl border border-white/20 flex items-center justify-around px-2 shadow-lg">

                                <button
                                    className="flex flex-col items-center gap-1 p-2 text-white/90 hover:scale-110 transition-all active:scale-95 group"
                                    onClick={() => {
                                        setAiMessage("好的，让我们一起翻翻老照片。");
                                        setIsTalking(true);
                                        setTimeout(() => {
                                            setIsTalking(false);
                                            setActiveScenario('memory');
                                        }, 800);
                                    }}
                                >
                                    <div className="w-10 h-10 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-indigo-500/50 transition-all">
                                        <ImageIcon size={20} className="text-white" />
                                    </div>
                                    <span className="text-[10px] font-medium opacity-80">相册</span>
                                </button>

                                <div className="flex items-center justify-center">
                                    <button
                                        onClick={toggleRecording}
                                        className={`w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-white border-4 border-slate-900 transition-all duration-300 ${isRecording
                                            ? 'bg-gradient-to-br from-red-500 to-rose-600 scale-110 animate-pulse'
                                            : 'bg-gradient-to-br from-indigo-600 to-violet-600'
                                            }`}
                                    >
                                        {isRecording ? (
                                            <div className="flex gap-1">
                                                <div className="w-1 h-3 bg-white rounded-full animate-bounce"></div>
                                                <div className="w-1 h-5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                <div className="w-1 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '75ms' }}></div>
                                            </div>
                                        ) : <Mic size={28} />}
                                    </button>
                                </div>

                                <button
                                    className="flex flex-col items-center gap-1 p-2 text-white/90 hover:scale-110 transition-all active:scale-95 group"
                                    onClick={() => medicationService.simulateReminder()}
                                >
                                    <div className="w-10 h-10 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-emerald-500/50 transition-all">
                                        <Pill size={20} className="text-white" />
                                    </div>
                                    <span className="text-[10px] font-medium opacity-80">服药</span>
                                </button>

                            </div>
                        </div>
                    )}

                </div> {/* Close HomeScreen */}

                {/* AIGC Avatar Creator Overlay */}
                {showAvatarCreator && (
                    <AvatarCreator
                        onAvatarCreated={(imageUrl) => {
                            setCustomAvatarUrl(imageUrl);
                            setAiMessage('哇，新形象真好看！我喜欢这个样子~');
                            setIsTalking(true);
                            setTimeout(() => setIsTalking(false), 2000);
                        }}
                        onClose={() => setShowAvatarCreator(false)}
                    />
                )}

                {/* AR实景导航叠加层 */}
                <ARNavigationOverlay
                    isActive={arModeActive}
                    steps={routeData?.steps || []}
                    destination={navDestination}
                    onClose={() => {
                        setArModeActive(false);
                        setActiveScenario('none');
                    }}
                />

                {/* 游荡警报 */}
                <WanderingAlert
                    onNavigateHome={() => {
                        // 导航回家
                        mapService.planWalkingRoute('当前位置', '家').then(route => {
                            setRouteData(route);
                            setNavDestination('家');
                            setActiveScenario('nav');
                        });
                    }}
                    onCallFamily={() => {
                        setAiMessage('正在联系您的家人...');
                        setIsTalking(true);
                        setTimeout(() => setIsTalking(false), 3000);
                    }}
                />

                {/* 服药提醒 */}
                <MedicationReminder
                    onTaken={() => {
                        setAiMessage('好的，已记录您服药了。记得多喝水~');
                        setIsTalking(true);
                        setTimeout(() => setIsTalking(false), 2000);
                    }}
                />

                {/* 认知报告 */}
                <CognitiveReport
                    isOpen={showCognitiveReport}
                    onClose={() => setShowCognitiveReport(false)}
                />

                {/* 认知报告入口按钮 - 右上角 */}
                {activeScenario === 'none' && (
                    <button
                        onClick={() => setShowCognitiveReport(true)}
                        className="absolute top-16 right-6 w-10 h-10 bg-purple-500/20 backdrop-blur-sm rounded-full flex items-center justify-center z-20 hover:bg-purple-500/30 transition-colors"
                        title="查看认知报告"
                    >
                        <Brain size={20} className="text-purple-600" />
                    </button>
                )}

            </div>

            <style>{`
                @keyframes shadowBreath { 0%, 100% { transform: translateX(-50%) scaleX(1.5) scaleY(1); opacity: 0.1; } 50% { transform: translateX(-50%) scaleX(1.4) scaleY(0.9); opacity: 0.05; } }
                @keyframes waveMic { 0%, 100% { height: 8px; } 50% { height: 24px; } }
                @keyframes beat { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.3); opacity: 0.8; } }
                .animate-shadow-breath { animation: shadowBreath 5s ease-in-out infinite; }
                .animate-wave-mic { animation: waveMic 1s ease-in-out infinite; }
                .animate-beat { animation: beat 1s ease-in-out infinite; }
                .animate-fade-in-up { animation: fadeInUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1); }
                .perspective-1000 { perspective: 1000px; }
                @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

export default ElderlyApp;
