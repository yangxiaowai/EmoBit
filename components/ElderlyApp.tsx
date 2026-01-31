
import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { SimulationType, SystemStatus, MemoryPhoto } from '../types';
import { ALBUM_MEMORIES } from '../config/albumMemories';
import { FACE_RECOGNITION_CONFIG } from '../config/faceRecognition';
import { Mic, Battery, Wifi, Signal, Info, ChevronLeft, ChevronRight, Image as ImageIcon, Images, Volume2, X, CloudSun, Loader2, Navigation, ScanLine, Pill, CheckCircle, ArrowUp, ArrowLeft, ArrowRight, MapPin, Camera, User, ScanFace, Box, AlertCircle, MicOff, Sparkles, Settings, Keyboard, Send } from 'lucide-react';
import { speechService, SpeechRecognitionResult } from '../services/speechService';
import { mapService, RouteResult, RouteStep } from '../services/mapService';
import { memoryService, LocationEvent } from '../services/memoryService';
import { VoiceService } from '../services/api';
import { voiceSelectionService } from '../services/voiceSelectionService';
import { aiService, AIResponse } from '../services/aiService';
import { wanderingService } from '../services/wanderingService';
import { homeArrivalService } from '../services/homeArrivalService';
import { medicationService } from '../services/medicationService';
import { faceService, FaceData } from '../services/faceService';
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

        for (let i = 0; i < particleCount; i++) {
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

// 3. Face Recognition Flow (人脸识别 - 帮助老人回忆亲属)
const FaceRecognitionFlow = ({ step, onClose }: { step: number; onClose: () => void }) => {
    const selectedFaceRef = useRef(FACE_RECOGNITION_CONFIG[Math.floor(Math.random() * FACE_RECOGNITION_CONFIG.length)]);
    const face = selectedFaceRef.current;
    const faceImageUrl = `/faces/${face.file}`;
    const [hasSpoken, setHasSpoken] = useState(false);

    useEffect(() => {
        if (step === 3 && !hasSpoken) {
            setHasSpoken(true);
            VoiceService.speak(face.description, undefined, undefined, () => {}).catch(() => {});
        }
    }, [step, face.description, hasSpoken]);

    useEffect(() => () => VoiceService.stop(), []);

    if (step === 0) {
        return (
            <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in font-sans">
                <div className="flex-1 flex flex-col items-center justify-center text-white">
                    <div className="w-24 h-24 rounded-full bg-indigo-500/30 flex items-center justify-center mb-6 animate-pulse">
                        <Camera size={48} className="text-indigo-300" />
                    </div>
                    <p className="text-xl font-bold mb-2">正在打开摄像头...</p>
                    <p className="text-slate-400 text-sm">请将镜头对准需要识别的人</p>
                </div>
                <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white z-10">
                    <X size={20} />
                </button>
            </div>
        );
    }

    if (step === 1) {
        return (
            <div className="absolute inset-0 z-50 bg-black flex flex-col animate-fade-in font-sans">
                <div className="flex-1 relative overflow-hidden">
                    <img src={faceImageUrl} className="w-full h-full object-cover" alt="摄像头画面" />
                    <div className="absolute inset-0 border-4 border-indigo-400/50 rounded-lg m-4 pointer-events-none">
                        <div className="absolute top-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                            正在拍摄...
                        </div>
                    </div>
                </div>
                <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white z-10">
                    <X size={20} />
                </button>
            </div>
        );
    }

    if (step === 2) {
        return (
            <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in font-sans">
                <div className="flex-1 flex flex-col items-center justify-center text-white">
                    <div className="w-32 h-32 rounded-full border-4 border-indigo-400 flex items-center justify-center mb-6 animate-spin" style={{ animationDuration: '2s' }}>
                        <ScanFace size={64} className="text-indigo-400" />
                    </div>
                    <p className="text-xl font-bold mb-2">正在识别人脸...</p>
                    <p className="text-slate-400 text-sm">AI 正在分析面部特征</p>
                </div>
                <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white z-10">
                    <X size={20} />
                </button>
            </div>
        );
    }

    // Step 3: 识别结果
    return (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in font-sans">
            <div className="flex-1 flex flex-col items-center justify-center p-6">
                <div className="relative w-48 h-48 rounded-2xl overflow-hidden border-4 border-emerald-400 shadow-2xl mb-6">
                    <img src={faceImageUrl} className="w-full h-full object-cover" alt={face.relation} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                        <p className="text-2xl font-black">{face.name ? `${face.relation} ${face.name}` : face.relation}</p>
                        <p className="text-sm text-white/80">识别成功</p>
                    </div>
                </div>
                <div className="bg-white/95 rounded-2xl p-6 w-full max-w-sm shadow-xl">
                    <div className="flex items-center gap-3 mb-4">
                        <CheckCircle size={32} className="text-emerald-500 shrink-0" />
                        <div>
                            <p className="text-lg font-bold text-slate-800">张爷爷，这是您的{face.relation}{face.name ? ` ${face.name}` : ''}</p>
                            <p className="text-slate-500 text-sm">正在为您播报...</p>
                        </div>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{face.description}</p>
                </div>
            </div>
            <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white z-10">
                <X size={20} />
            </button>
        </div>
    );
};

// 4. Immersive Memories Scenario (时光相册 - 手动切换模式)
const MemoriesFlow = ({ step, onClose, onPrev, onNext }: { step: number; onClose: () => void; onPrev: () => void; onNext: () => void }) => {
    // Loop through photos based on step
    const photoIndex = step % ALBUM_MEMORIES.length;
    const photo = ALBUM_MEMORIES[photoIndex];
    const [isSpeaking, setIsSpeaking] = useState(false);

    // 播放当前照片的语音（给爷爷回忆照片内容的讲述风格）
    const playNarration = useCallback(() => {
        setIsSpeaking(true);
        const textToSpeak = `张爷爷，让我帮您回忆一下这张照片。${photo.location}。${photo.story}`;
        VoiceService.speak(textToSpeak, undefined, undefined, () => setIsSpeaking(false)).catch(() => setIsSpeaking(false));
    }, [photo]);

    // 初次进入时自动播放第一张（先停止其他语音，延迟后再播，避免重复/重叠）
    useEffect(() => {
        VoiceService.stop();
        const timer = setTimeout(() => playNarration(), 400);
        return () => {
            clearTimeout(timer);
            VoiceService.stop();
        };
    }, []);

    // 切换照片时停止当前语音
    const handlePrev = () => {
        VoiceService.stop();
        setIsSpeaking(false);
        onPrev();
        setTimeout(() => {
            const prevIndex = (step - 1 + ALBUM_MEMORIES.length) % ALBUM_MEMORIES.length;
            const prevPhoto = ALBUM_MEMORIES[prevIndex];
            setIsSpeaking(true);
            VoiceService.speak(`张爷爷，让我帮您回忆一下这张照片。${prevPhoto.location}。${prevPhoto.story}`, undefined, undefined, () => setIsSpeaking(false)).catch(() => setIsSpeaking(false));
        }, 300);
    };

    const handleNext = () => {
        VoiceService.stop();
        setIsSpeaking(false);
        onNext();
        setTimeout(() => {
            const nextIndex = (step + 1) % ALBUM_MEMORIES.length;
            const nextPhoto = ALBUM_MEMORIES[nextIndex];
            setIsSpeaking(true);
            VoiceService.speak(`张爷爷，让我帮您回忆一下这张照片。${nextPhoto.location}。${nextPhoto.story}`, undefined, undefined, () => setIsSpeaking(false)).catch(() => setIsSpeaking(false));
        }, 300);
    };

    return (
        <div className="absolute inset-0 z-50 bg-black animate-fade-in font-sans">
            {/* 照片区域：绝对定位，top-14 bottom-[280px] 可单独调整照片上下位置 */}
            <div className="absolute top-14 left-0 right-0 bottom-[260px] flex items-center justify-center">
                <div className="scale-110 max-w-full max-h-full flex items-center justify-center">
                    <img
                        key={photo.id}
                        src={photo.url}
                        className="max-w-full max-h-full object-contain"
                        alt="Memory"
                    />
                </div>
            </div>

            {/* Close Button */}
            <div className="absolute top-0 right-0 z-10 px-6 pt-12">
                <button
                    onClick={onClose}
                    className="w-8 h-8 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 text-white hover:bg-white/20 transition-colors z-50"
                >
                    <X size={18} />
                </button>
            </div>

            {/* 左右切换按钮：z-30 确保可点击，pt-32 控制按钮上下位置（值越大越靠下） */}
            <div className="absolute inset-x-0 top-0 bottom-0 z-30 flex items-start justify-between px-4 pt-[80%]">
                <button
                    onClick={handlePrev}
                    className="w-12 h-12 bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/15 text-white/90 hover:bg-black/30 transition-colors active:scale-95"
                >
                    <ChevronLeft size={24} />
                </button>
                <button
                    onClick={handleNext}
                    className="w-12 h-12 bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/15 text-white/90 hover:bg-black/30 transition-colors active:scale-95"
                >
                    <ChevronRight size={24} />
                </button>
            </div>

            {/* 文字区域：绝对定位在底部，top-[calc(100%-280px)] 或 bottom-0 h-[280px] 可单独调整 */}
            <div className="absolute bottom-0 left-0 right-0 z-10 h-[390px] pt-8 px-8 pb-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent overflow-hidden">
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
    const [activeScenario, setActiveScenario] = useState<'none' | 'nav' | 'meds' | 'memory' | 'face'>('none');
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

    // 输入模式：voice=长按说话, keyboard=键盘输入
    const [useKeyboardInput, setUseKeyboardInput] = useState(false);
    const [textInputValue, setTextInputValue] = useState('');

    // 人脸识别状态 (Face Album Feature)
    const [showFaceRecognition, setShowFaceRecognition] = useState(false);
    const [recognizedFace, setRecognizedFace] = useState<FaceData | null>(null);

    // Auto-scroll ref
    const messagesEndRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [aiMessage, voiceInputDisplay, isTalking]);

    // Edge 预生成：确认音「嗯」等
    useEffect(() => {
        // EdgeTTS 已移除，不再预加载
    }, []);

    // 进入老人端：预拉常用句 + 延迟一次打招呼（仅播一次，避免 React Strict Mode 双挂载导致重复）
    // 同时检测是否到家，如果到家则询问是否打开时光相册
    useEffect(() => {
        let cancelled = false;
        let greetingTimeoutId: ReturnType<typeof setTimeout> | null = null;

        const initTTSAndGreeting = async () => {
            try {
                const available = await VoiceService.checkAvailability();
                if (cancelled) return;
                if (available) {
                    console.log('[ElderlyApp] Edge TTS 可用，预加载常用句');
                    VoiceService.preloadClonePhrases();

                    // 检测是否到家且本次会话未询问过
                    const isAtHome = homeArrivalService.isAtHome();
                    const alreadyPrompted = homeArrivalService.hasPromptedThisSession();

                    let greeting: string;
                    if (isAtHome && !alreadyPrompted) {
                        // 到家了，询问是否打开时光相册
                        greeting = '张爷爷，您到家了呢！要不要看看时光相册，回忆一下美好时光？';
                        homeArrivalService.markPrompted();
                        console.log('[ElderlyApp] 检测到家，询问是否打开时光相册');
                    } else {
                        greeting = '张爷爷，我是您的数字人助手。今天身体怎么样？';
                    }

                    setAiMessage(greeting);
                    greetingTimeoutId = setTimeout(() => {
                        if (cancelled) return;
                        VoiceService.speak(greeting, undefined, undefined, undefined).catch(() => { });
                    }, 1000);
                } else {
                    console.warn('[ElderlyApp] TTS 服务不可用，请确保 edge_tts_server 已启动');
                }
            } catch (e) {
                if (!cancelled) console.error('[ElderlyApp] TTS 初始化失败:', e);
            }
        };
        initTTSAndGreeting();

        return () => {
            cancelled = true;
            if (greetingTimeoutId) clearTimeout(greetingTimeoutId);
        };
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

        // 肯定回复意图（用于到家询问时光相册的回复）
        // 如 "好"、"要"、"打开"、"可以"、"行" 等
        const affirmativeKeywords = ['好', '要', '打开', '可以', '行', '看看', '好的', '嗯', '是', '对'];
        if (affirmativeKeywords.some(k => lowerText.includes(k)) && lowerText.length <= 10) {
            // 短促的肯定回复视为同意打开相册
            console.log('[ElderlyApp] 检测到肯定回复，打开时光相册');
            return { intent: 'memory' };
        }

        // 回忆意图
        const memoryKeywords = ['照片', '回忆', '以前', '老照片'];
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

    // 保存所有中间识别结果（用于整合处理）
    const interimResultsRef = useRef<string[]>([]);
    const lastRecognitionResultRef = useRef<SpeechRecognitionResult | null>(null);
    const finalResultTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isProcessingRef = useRef<boolean>(false); // 防止重复处理
    const holdRecordingRef = useRef<boolean>(false); // 长按说话：是否由按住手势触发的录音

    // 整合识别结果：智能合并所有中间结果，选择最完整、最准确的句子
    const consolidateResults = useCallback((results: string[]): string => {
        if (results.length === 0) return '';

        // 去重并过滤空结果
        const uniqueResults = Array.from(new Set(results.filter(r => r && r.trim())));
        if (uniqueResults.length === 0) return '';

        // 如果只有一个结果，直接返回
        if (uniqueResults.length === 1) {
            console.log('[ElderlyApp] 📝 整合识别结果: 只有一个结果，直接使用');
            return uniqueResults[0];
        }

        // 按长度排序，优先考虑较长的结果（通常更完整）
        const sorted = uniqueResults.sort((a, b) => b.length - a.length);

        // 智能选择策略：
        // 1. 优先选择包含标点符号的结果（更可能是完整句子）
        // 2. 优先选择最长的结果
        // 3. 如果多个结果相似，选择最完整的

        let bestResult = sorted[0];
        let bestScore = 0;

        for (const result of sorted) {
            let score = result.length; // 基础分数：长度

            // 加分项：
            // 1. 包含标点符号（句号、问号、感叹号）- 表示完整句子
            if (/[。！？]/.test(result)) {
                score += 50;
            }

            // 2. 包含常见疑问词（更可能是完整问题）
            if (/[怎么|什么|哪里|哪个|为什么|如何]/.test(result)) {
                score += 30;
            }

            // 3. 包含常见动词（更可能是完整表达）
            if (/[是|有|在|去|来|说|看|听|想|做]/.test(result)) {
                score += 20;
            }

            // 4. 不包含明显的截断（不以常见截断词结尾）
            if (!/[的|了|呢|啊|吧]$/.test(result)) {
                score += 10;
            }

            // 5. 检查是否包含其他结果的关键内容（更完整）
            let containsOthers = 0;
            for (const other of sorted) {
                if (result !== other && result.includes(other)) {
                    containsOthers += other.length;
                }
            }
            score += containsOthers * 0.5;

            if (score > bestScore) {
                bestScore = score;
                bestResult = result;
            }
        }

        // 清理结果：移除重复的标点符号，统一标点
        bestResult = bestResult
            .replace(/[。]{2,}/g, '。')  // 多个句号合并为一个
            .replace(/[！]{2,}/g, '！')    // 多个感叹号合并为一个
            .replace(/[？]{2,}/g, '？')    // 多个问号合并为一个
            .trim();

        console.log('[ElderlyApp] 📝 整合识别结果:');
        console.log('[ElderlyApp]   所有中间结果:', uniqueResults);
        console.log('[ElderlyApp]   选择最完整结果:', bestResult);
        console.log('[ElderlyApp]   结果长度:', bestResult.length, '字符');
        console.log('[ElderlyApp]   评分:', bestScore.toFixed(1));

        return bestResult;
    }, []);

    // 处理最终识别结果（提取为独立函数，处理 AI 调用和语音播放）
    const processFinalResult = useCallback(async (result: SpeechRecognitionResult) => {
        // 防止重复处理
        if (isProcessingRef.current) {
            console.log('[ElderlyApp] ⚠️ 正在处理中，忽略重复的最终结果');
            return;
        }
        isProcessingRef.current = true;
        // 最终结果
        console.log('='.repeat(60));
        console.log(`[ElderlyApp] ✅ 最终识别结果: "${result.text}"`);
        console.log('='.repeat(60));

        // 验证识别结果
        if (!result.text || !result.text.trim()) {
            console.error('[ElderlyApp] ❌ 识别结果为空，无法处理');
            return;
        }

        setInterimText('');
        setIsListening(false);

        // 清除超时定时器（已收到最终结果）
        if (finalResultTimeoutRef.current) {
            clearTimeout(finalResultTimeoutRef.current);
            finalResultTimeoutRef.current = null;
        }

        // 清空中间结果数组（已处理完成）
        interimResultsRef.current = [];

        // 收到最终结果，停止识别
        console.log('[ElderlyApp] 收到最终结果，停止识别并处理...');
        setIsRecording(false);
        speechService.stopRecognition();

        setVoiceInputDisplay(result.text);
        setIsThinking(true);

        console.log('[ElderlyApp] 正在调用 AI 服务处理:', result.text);
        // EdgeTTS 已移除，不再播放确认音

        try {
            console.log('[ElderlyApp] ============================================================');
            console.log('[ElderlyApp] 调用 AI 服务，输入:', result.text);
            console.log('[ElderlyApp] ============================================================');

            // --- Voice Command Interception for Face Recognition ---
            if (result.text.includes('人脸') || result.text.includes('认人') || result.text.includes('是谁') || result.text.includes('照片')) {
                console.log('[ElderlyApp] 🛡️ 拦截到人脸识别指令');
                const allFaces = faceService.getFaces();
                const reply = "好的，正在为您开启人脸识别。请将摄像头对准面前的人。";

                setAiMessage(reply);
                setIsThinking(false);
                setIsTalking(true);

                VoiceService.speakSegments(reply, undefined, undefined, () => {
                    setIsTalking(false);
                    setShowFaceRecognition(true);
                    setRecognizedFace(null);

                    // Simulate recognition after 3 seconds if faces exist
                    if (allFaces.length > 0) {
                        setTimeout(() => {
                            // Randomly pick one for simulation
                            const randomFace = allFaces[Math.floor(Math.random() * allFaces.length)];
                            setRecognizedFace(randomFace);
                            VoiceService.speakSegments(`这是您的${randomFace.relation}，${randomFace.name}。`);
                        }, 3000);
                    } else {
                        setTimeout(() => {
                            VoiceService.speakSegments("相册中暂无照片，请让家属先要在后台添加照片哦。");
                        }, 2000);
                    }
                });
                setVoiceInputDisplay(null);
                isProcessingRef.current = false;
                return;
            }
            // -----------------------------------------------------

            // --- Voice Command Interception for Face Recognition ---
            if (result.text.includes('人脸') || result.text.includes('认人') || result.text.includes('是谁')) {
                console.log('[ElderlyApp] 🛡️ 拦截到人脸识别指令');
                const allFaces = faceService.getFaces();
                const reply = "好的，正在为您开启人脸识别。请将摄像头对准面前的人。";

                setAiMessage(reply);
                setIsThinking(false);
                setIsTalking(true);

                VoiceService.speakSegments(reply, undefined, undefined, () => {
                    setIsTalking(false);
                    setShowFaceRecognition(true);

                    // Simulate recognition after 3 seconds if faces exist
                    if (allFaces.length > 0) {
                        setTimeout(() => {
                            // Randomly pick one for simulation
                            const randomFace = allFaces[Math.floor(Math.random() * allFaces.length)];
                            setRecognizedFace(randomFace);
                            VoiceService.speakSegments(`这是您的${randomFace.relation}，${randomFace.name}。`);
                        }, 3000);
                    } else {
                        setTimeout(() => {
                            VoiceService.speakSegments("相册中暂无照片，请让家属先要在后台添加照片哦。");
                        }, 2000);
                    }
                });
                setVoiceInputDisplay(null);
                isProcessingRef.current = false;
                return;
            }
            // -----------------------------------------------------

            // 检查 AI 服务是否配置
            if (!aiService.isConfigured()) {
                console.warn('[ElderlyApp] ⚠️ AI 服务未配置 API Key，将使用本地回复');
            }

            // 确保识别文本不为空
            if (!result.text || !result.text.trim()) {
                console.error('[ElderlyApp] ❌ 识别结果为空，无法调用 AI 服务');
                throw new Error('识别结果为空');
            }

            console.log('[ElderlyApp] 开始调用 aiService.chat()...');
            const response = await aiService.chat(result.text);
            console.log('[ElderlyApp] ✅ AI 服务响应:', response);
            console.log('[ElderlyApp] AI 回复文本:', response?.text);

            if (!response) {
                console.error('[ElderlyApp] ❌ AI 服务返回 null 或 undefined');
                throw new Error('AI 服务返回 null');
            }

            if (!response.text || !response.text.trim()) {
                console.error('[ElderlyApp] ❌ AI 服务返回空文本');
                console.error('[ElderlyApp] 完整响应对象:', JSON.stringify(response, null, 2));
                throw new Error('AI 服务返回空文本');
            }

            console.log('[ElderlyApp] ✅ AI 服务调用成功，回复:', response.text);

            setVoiceInputDisplay(null);
            setAiMessage(response.text);
            setIsThinking(false);
            setIsTalking(true);

            console.log('[ElderlyApp] 开始播放 AI 回复:', response.text);
            console.log('[ElderlyApp] 检查语音服务状态...');

            // 检查语音服务（Edge TTS）
            const ttsAvailable = await VoiceService.checkAvailability();
            console.log('[ElderlyApp] 语音服务状态:', ttsAvailable ? '✅ 可用' : '❌ 不可用');

            if (!ttsAvailable) {
                console.warn('[ElderlyApp] ⚠️ 语音服务不可用，请确保 edge_tts_server 已启动');
            }

            // 播放语音
            try {
                await VoiceService.speakSegments(
                    response.text,
                    undefined,
                    undefined,
                    () => {
                        console.log('[ElderlyApp] ✅ 语音播放完成');
                        setIsTalking(false);
                    }
                );
                console.log('[ElderlyApp] ✅ 语音播放已启动');
            } catch (speakError) {
                console.error('[ElderlyApp] ❌ 语音播放失败:', speakError);
                setIsTalking(false);
                // 即使语音播放失败，也要显示文本回复
            }

            // 记录对话用于认知评估
            cognitiveService.recordConversation(result.text, response.text);

            if (response.shouldTriggerAction) {
                setTimeout(() => {
                    VoiceService.stop();
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
                        case 'face':
                            setActiveScenario('face');
                            setStep(0);
                            break;
                    }
                }, 2500);
            }
        } catch (error) {
            console.error('[ElderlyApp] ❌ AI服务错误:', error);
            console.error('[ElderlyApp] 错误详情:', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });

            setIsThinking(false);
            setVoiceInputDisplay(null);

            const errorMessage = '抱歉，我没太听清楚，您能再说一遍吗？';
            setAiMessage(errorMessage);
            setIsTalking(true);

            // 尝试播放错误提示
            VoiceService.speakSegments(
                errorMessage,
                undefined,
                undefined,
                () => setIsTalking(false)
            ).catch((speakErr) => {
                console.error('[ElderlyApp] ❌ 播放错误提示也失败:', speakErr);
                setIsTalking(false);
            });
        } finally {
            // 处理完成后重置标志
            isProcessingRef.current = false;
        }
    }, []);

    // 处理语音识别结果 - 使用AI大模型
    const handleSpeechResult = useCallback(async (result: SpeechRecognitionResult) => {
        // 详细日志输出
        console.log('[ElderlyApp] ============================================================');
        console.log('[ElderlyApp] 📥 收到识别结果:', {
            text: result.text,
            isFinal: result.isFinal,
            confidence: result.confidence,
        });
        console.log('[ElderlyApp] ============================================================');

        // 保存最后一个结果（包括中间结果）
        if (result.text && result.text.trim()) {
            lastRecognitionResultRef.current = result;
        }

        if (!result.isFinal) {
            // 收集中间结果
            if (result.text && result.text.trim()) {
                interimResultsRef.current.push(result.text.trim());
                console.log('[ElderlyApp] 🔄 中间结果（已收集，等待用户停止说话）:', result.text);
                console.log('[ElderlyApp]   当前已收集', interimResultsRef.current.length, '个中间结果');
            }
            setInterimText(result.text);

            // 清除之前的超时定时器
            if (finalResultTimeoutRef.current) {
                clearTimeout(finalResultTimeoutRef.current);
            }

            // 改进的超时机制：只在用户停止说话后（2秒内没有新的中间结果）才处理
            // 增加等待时间，确保用户真正停止说话，避免在用户说话过程中触发
            finalResultTimeoutRef.current = setTimeout(() => {
                // 检查是否还在处理中，避免重复处理
                if (isProcessingRef.current) {
                    console.log('[ElderlyApp] ⚠️ 已在处理中，忽略超时触发');
                    return;
                }

                // 整合所有中间结果
                if (interimResultsRef.current.length > 0) {
                    const consolidatedText = consolidateResults(interimResultsRef.current);
                    if (consolidatedText) {
                        console.log('[ElderlyApp] ⚠️ 用户停止说话（2秒内无新结果），整合并处理结果');
                        console.log('[ElderlyApp]   整合后的文本:', consolidatedText);
                        // 处理整合后的结果
                        processFinalResult({
                            text: consolidatedText,
                            isFinal: true,
                            confidence: undefined,
                        });
                    }
                }
            }, 2000); // 增加到2秒，确保用户真正停止说话

            return;
        }

        // 清除超时定时器（已收到最终结果）
        if (finalResultTimeoutRef.current) {
            clearTimeout(finalResultTimeoutRef.current);
            finalResultTimeoutRef.current = null;
        }

        // 如果服务器发送了最终结果，优先使用它
        // 但也可以整合中间结果和最终结果，选择最完整的
        let finalText = result.text;
        if (interimResultsRef.current.length > 0) {
            // 将最终结果也加入整合列表
            interimResultsRef.current.push(result.text.trim());
            const consolidatedText = consolidateResults(interimResultsRef.current);
            if (consolidatedText && consolidatedText.length > finalText.length) {
                console.log('[ElderlyApp] 📝 使用整合后的结果（比服务器最终结果更完整）');
                finalText = consolidatedText;
            }
        }

        // 处理最终结果（中间结果会在processFinalResult中清空）
        processFinalResult({
            ...result,
            text: finalText,
        });
    }, [processFinalResult, consolidateResults]);

    // 开始/停止语音识别
    const toggleRecording = useCallback(async () => {
        if (isRecording) {
            console.log('[ElderlyApp] 用户手动停止录音');

            // 清除超时定时器（停止自动处理）
            if (finalResultTimeoutRef.current) {
                clearTimeout(finalResultTimeoutRef.current);
                finalResultTimeoutRef.current = null;
            }

            // 先停止识别，等待服务器发送最终结果
            setIsRecording(false);
            setIsListening(false);
            speechService.stopRecognition();

            // 等待服务器发送最终结果（最多等待10秒）
            // 服务器处理音频可能需要5-10秒（特别是长音频），所以增加等待时间
            // 如果10秒内没有收到最终结果，整合所有中间结果
            setTimeout(() => {
                // 检查是否已经在处理中
                if (isProcessingRef.current) {
                    console.log('[ElderlyApp] 已在处理最终结果，无需使用中间结果');
                    return;
                }

                // 整合所有中间结果（作为后备方案）
                if (interimResultsRef.current.length > 0) {
                    const consolidatedText = consolidateResults(interimResultsRef.current);
                    if (consolidatedText) {
                        console.log('[ElderlyApp] ⚠️ 等待10秒后未收到最终结果，整合并处理中间结果');
                        console.log('[ElderlyApp]   整合后的文本:', consolidatedText);
                        processFinalResult({
                            text: consolidatedText,
                            isFinal: true,
                            confidence: undefined,
                        });
                    }
                } else if (!lastRecognitionResultRef.current) {
                    console.log('[ElderlyApp] ⚠️ 没有识别结果，无法处理');
                    console.log('[ElderlyApp] 提示：服务器可能仍在处理音频，请稍候...');
                }
            }, 10000); // 等待10秒让服务器发送最终结果（支持长音频处理）

            return;
        }

        try {
            setSpeechError(null);
            setIsRecording(true);
            setIsListening(true);
            isProcessingRef.current = false; // 重置处理标志
            lastRecognitionResultRef.current = null; // 重置最后一个结果
            interimResultsRef.current = []; // 清空中间结果数组

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

    // 长按说话：按住开始录音，松开停止
    const handleHoldStart = useCallback(() => {
        holdRecordingRef.current = true;
        if (!isRecording) toggleRecording();
    }, [isRecording, toggleRecording]);

    const handleHoldEnd = useCallback(() => {
        if (!holdRecordingRef.current) return;
        holdRecordingRef.current = false;

        console.log('[ElderlyApp] 长按松开，停止录音');
        if (finalResultTimeoutRef.current) {
            clearTimeout(finalResultTimeoutRef.current);
            finalResultTimeoutRef.current = null;
        }
        setIsRecording(false);
        setIsListening(false);
        speechService.stopRecognition();
        setTimeout(() => {
            if (isProcessingRef.current) return;
            if (interimResultsRef.current.length > 0) {
                const consolidatedText = consolidateResults(interimResultsRef.current);
                if (consolidatedText) {
                    processFinalResult({ text: consolidatedText, isFinal: true, confidence: undefined });
                }
            } else if (!lastRecognitionResultRef.current) {
                console.log('[ElderlyApp] 没有识别结果');
            }
        }, 10000);
    }, [consolidateResults, processFinalResult]);

    // 键盘输入提交
    const handleTextSubmit = useCallback(() => {
        const text = textInputValue.trim();
        if (!text) return;
        setTextInputValue('');
        processFinalResult({ text, isFinal: true, confidence: undefined });
    }, [textInputValue, processFinalResult]);

    // 打开相册（时光回忆录）
    const openAlbum = useCallback(() => {
        VoiceService.stop();
        setAiMessage("好的，让我们一起翻翻老照片。");
        setIsTalking(true);
        setTimeout(() => {
            setIsTalking(false);
            setActiveScenario('memory');
        }, 800);
    }, []);

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

                {/* Face Recognition Overlay */}
                {showFaceRecognition && (
                    <div className="absolute inset-0 z-[100] bg-black flex flex-col items-center justify-center font-sans select-none animate-fade-in">
                        <div className="absolute top-6 right-6 z-10 pointer-events-auto">
                            <button onClick={() => { setShowFaceRecognition(false); setRecognizedFace(null); }} className="bg-white/20 p-3 rounded-full text-white backdrop-blur-md hover:bg-white/30 transition-colors">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="w-full px-6 text-center mt-[-40px]">
                            <h2 className="text-2xl text-white/90 font-bold mb-8 animate-pulse">正在识别面前的人...</h2>

                            <div className="relative aspect-[3/4] w-full max-w-[280px] mx-auto bg-slate-800 rounded-3xl overflow-hidden border-4 border-indigo-500 shadow-[0_0_50px_rgba(99,102,241,0.5)]">
                                {/* Simulated Camera Feed */}
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                                    {!recognizedFace && <Camera size={48} className="text-slate-600 opacity-50" />}
                                    {recognizedFace && <img src={recognizedFace.imageUrl} className="w-full h-full object-cover animate-fade-in" />}
                                </div>

                                {/* Scanning Effect */}
                                {!recognizedFace && (
                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-500/20 to-transparent w-full h-full animate-[scan_2s_ease-in-out_infinite]" />
                                )}

                                {recognizedFace && (
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-4 text-white animate-slide-up">
                                        <h3 className="text-2xl font-bold mb-1">{recognizedFace.name}</h3>
                                        <p className="text-lg text-indigo-300 font-bold">{recognizedFace.relation}</p>
                                    </div>
                                )}
                            </div>

                            {!recognizedFace && <p className="text-slate-400 mt-6 text-sm">请将摄像头对准面部</p>}
                        </div>
                    </div>
                )}

                {/* --- SCENARIO LAYERS --- */}
                {activeScenario === 'nav' && <ARNavigationFlow step={step} routeData={routeData} destination={navDestination} />}
                {activeScenario === 'meds' && <MedicationFlow step={step} />}
                {activeScenario === 'face' && (
                    <FaceRecognitionFlow
                        step={Math.min(step, 3)}
                        onClose={() => {
                            VoiceService.stop();
                            setActiveScenario('none');
                            setStep(0);
                        }}
                    />
                )}
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

                    {/* AI 消息展示区域（紧凑） */}
                    {(voiceInputDisplay || aiMessage) && (
                        <div className="shrink-0 px-4 pb-1 relative z-10 min-h-0">
                            <div className="bg-white/60 backdrop-blur-sm py-2 px-3 rounded-xl text-center">
                                {voiceInputDisplay ? (
                                    <p className="text-slate-800 text-sm font-bold truncate">"{voiceInputDisplay}"</p>
                                ) : (
                                    <p className="text-slate-600 text-sm font-medium truncate">{aiMessage}</p>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        </div>
                    )}
                    {/* 输入框：左侧键盘 | 中间语音/文字 | 右侧相册 — 固定在底部 */}
                    <div className="shrink-0 px-3 pb-6 pt-2 relative z-10">
                        <div
                            className="bg-[#F7F7F7] rounded-[2rem] min-h-[68px] flex items-center justify-between px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)] select-none"
                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                        >
                            {/* 左侧：键盘输入（点击切换键盘/语音模式） */}
                            <button
                                type="button"
                                onClick={() => setUseKeyboardInput(prev => !prev)}
                                className={`w-12 h-12 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${useKeyboardInput ? 'border-indigo-500 bg-indigo-50 text-indigo-600' : 'border-slate-400/60 text-slate-600 hover:bg-slate-100'}`}
                                title={useKeyboardInput ? '切换为语音输入' : '使用键盘输入'}
                            >
                                <Keyboard size={24} strokeWidth={2} />
                            </button>
                            {/* 中央：键盘模式=文字输入框，语音模式=长按说话 */}
                            {useKeyboardInput ? (
                                <div className="flex-1 flex items-center gap-2 min-w-0 mx-3">
                                    <input
                                        type="text"
                                        value={textInputValue}
                                        onChange={(e) => setTextInputValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleTextSubmit(); }}
                                        placeholder="输入文字发送..."
                                        className="flex-1 min-w-0 h-12 px-4 rounded-2xl bg-white border border-slate-200 text-base text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={handleTextSubmit}
                                        disabled={!textInputValue.trim()}
                                        className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Send size={20} strokeWidth={2} />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className="flex-1 flex items-center justify-center min-h-[48px] min-w-0 mx-3 cursor-pointer active:opacity-80 transition-opacity"
                                    onPointerDown={handleHoldStart}
                                    onPointerUp={handleHoldEnd}
                                    onPointerLeave={handleHoldEnd}
                                    onContextMenu={(e) => e.preventDefault()}
                                >
                                    <span className="text-slate-600 font-medium text-lg">
                                        {isListening ? '正在聆听...' : isThinking ? '思考中...' : '长按说话'}
                                    </span>
                                </div>
                            )}
                            {/* 右侧：相册（时光回忆录） */}
                            <button
                                type="button"
                                onClick={openAlbum}
                                className="w-12 h-12 rounded-full border-2 border-slate-400/60 flex items-center justify-center flex-shrink-0 text-slate-600 hover:bg-slate-100 transition-colors"
                                title="打开相册"
                            >
                                <Images size={26} strokeWidth={2} />
                            </button>
                        </div>
                    </div>

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
