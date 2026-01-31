
import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { SimulationType, SystemStatus, MemoryPhoto } from '../types';
import { Mic, Battery, Wifi, Signal, Info, ChevronLeft, ChevronRight, Image as ImageIcon, Volume2, X, CloudSun, Loader2, Navigation, ScanLine, Pill, CheckCircle, ArrowUp, ArrowLeft, ArrowRight, MapPin, Camera, User, ScanFace, Box, AlertCircle, MicOff, Sparkles, Settings, Brain } from 'lucide-react';
import { speechService, SpeechRecognitionResult } from '../services/speechService';
import { webSpeechService } from '../services/webSpeechService';
import { mapService, RouteResult, RouteStep } from '../services/mapService';
import { memoryService, LocationEvent, MemoryAnchor } from '../services/memoryService';
import { VoiceService } from '../services/api';
import { voiceSelectionService } from '../services/voiceSelectionService';
import { aiService, AIResponse } from '../services/aiService';
import { wanderingService } from '../services/wanderingService';
import { medicationService } from '../services/medicationService';
import { cognitiveService } from '../services/cognitiveService';
import { proactiveService } from '../services/proactiveService';
import AvatarCreator from './AvatarCreator';

import WanderingAlert from './WanderingAlert';
import MedicationReminder from './MedicationReminder';
import CognitiveReport from './CognitiveReport';

interface ElderlyAppProps {
    status: SystemStatus;
    simulation: SimulationType;
}

// --- Data ---
// --- Data ---
// 模拟当前位置（示例用）
const CURRENT_LOCATION_MOCK = { lat: 39.9142, lng: 116.3974 }; // 靠近 demo_park

const convertAnchorToPhoto = (anchor: MemoryAnchor): MemoryPhoto => ({
    id: anchor.id,
    url: anchor.imageUrl || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=600&auto=format&fit=crop", // Fallback image
    date: anchor.createdAt.toLocaleDateString(),
    location: anchor.name,
    story: anchor.memoryText,
    tags: [anchor.category]
});

// Default Fallback
const DEFAULT_MEMORIES: MemoryPhoto[] = [
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

// 2. Medication Guide Scenario (Smart Pillbox Flow)
const MedicationFlow = ({ step, onClose }: { step: number; onClose?: () => void }) => {
    // Simplified Smart Pillbox Flow
    const boxImage = "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?q=80&w=800"; // Smart Pillbox

    let state = { text: "请等待药盒提示", sub: "正在连接智能药盒...", img: boxImage, overlay: null as React.ReactNode };

    // Simply simulate connection -> open -> taken
    const safeStep = Math.min(step, 3);

    if (safeStep === 0) {
        state = {
            text: "正在连接智能药盒...",
            sub: "请确保药盒已开启",
            img: boxImage,
            overlay: <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-white" size={64} /></div>
        };
    } else if (safeStep === 1) {
        state = {
            text: "药盒已连接",
            sub: "检测到今日药仓未开启",
            img: boxImage,
            overlay: <CheckCircle className="text-emerald-500 animate-pulse" size={64} />
        };
    } else if (safeStep === 2) {
        state = {
            text: "请取出药物",
            sub: "药盒第3仓已自动弹开",
            img: boxImage,
            overlay: (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/90 px-6 py-4 rounded-xl shadow-xl border-2 border-indigo-500 animate-bounce">
                    <p className="text-xl font-bold text-indigo-700">请取药</p>
                </div>
            )
        };
        state = {
            text: "服药确认",
            sub: "检测到药物已取出",
            img: boxImage,
            overlay: <CheckCircle className="text-emerald-500" size={80} />
        };
    }

    // Auto-close on final step
    useEffect(() => {
        if (safeStep >= 3) {
            const timer = setTimeout(() => {
                onClose?.();
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [safeStep, onClose]);


    return (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in font-sans">
            <div className="flex-1 relative overflow-hidden bg-black">
                <img src={state.img} className="w-full h-full object-cover opacity-80" alt="Medication" />
                <div className="absolute inset-0 flex items-center justify-center">{state.overlay}</div>
            </div>
            <div className="bg-white rounded-t-[2.5rem] p-8 -mt-6 relative z-10 shadow-2xl">
                <h2 className="text-2xl font-black text-slate-800 mb-1">{state.text}</h2>
                <p className="text-slate-500 font-bold flex items-center gap-2">
                    <Volume2 size={16} className="text-indigo-500" />
                    {state.sub}
                </p>
                <div className="flex gap-2 mt-8">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className={`h-2 rounded-full flex-1 transition-all ${i <= safeStep ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                    ))}
                </div>
                {safeStep >= 3 && (
                    <button
                        onClick={onClose}
                        className="mt-6 w-full bg-slate-900 text-white rounded-xl py-4 font-bold active:scale-95 transition-transform"
                    >
                        完成
                    </button>
                )}
            </div>
        </div>
    );
};

// 3. Immersive Memories Scenario (手动/语音切换模式)
const MemoriesFlow = ({ step, memories, onClose, onPrev, onNext }: { step: number; memories: MemoryPhoto[]; onClose: () => void; onPrev: () => void; onNext: () => void }) => {
    // Loop through photos based on step
    const safeMemories = memories.length > 0 ? memories : DEFAULT_MEMORIES;
    const photoIndex = step % safeMemories.length;
    const photo = safeMemories[photoIndex];
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Update AI Service Context when photo changes
    useEffect(() => {
        aiService.setContext(`老人正在观看照片：
        地点：${photo.location}
        时间：${photo.date}
        背后的故事：${photo.story}
        标签：${photo.tags.join(', ')}
        
        如果老人对此照片发表评论，请结合上述信息进行回应。`);

        return () => aiService.clearContext();
    }, [photo]);

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
            const prevIndex = (step - 1 + safeMemories.length) % safeMemories.length;
            const prevPhoto = safeMemories[prevIndex];
            setIsSpeaking(true);
            VoiceService.speak(`${prevPhoto.location}。${prevPhoto.story}`, undefined, undefined, () => setIsSpeaking(false)).catch(() => setIsSpeaking(false));
        }, 300);
    };

    const handleNext = () => {
        VoiceService.stop();
        setIsSpeaking(false);
        onNext();
        setTimeout(() => {
            const nextIndex = (step + 1) % safeMemories.length;
            const nextPhoto = safeMemories[nextIndex];
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
                    <ImageIcon size={12} /> 时光回忆录 ({photoIndex + 1}/{safeMemories.length})
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

    // Chat UI States
    const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string, type?: 'image' | 'video', mediaUrl?: string }[]>([]);
    const [inputText, setInputText] = useState('');
    const [showUploadMenu, setShowUploadMenu] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    // Staging Media
    const [pendingMedia, setPendingMedia] = useState<{ type: 'image' | 'video', url: string } | null>(null);

    // Auto-scroll chat
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages]);




    // Scenario Flow State
    const [activeScenario, setActiveScenario] = useState<'none' | 'nav' | 'meds' | 'memory'>('none');
    const [step, setStep] = useState(0);
    const [voiceInputDisplay, setVoiceInputDisplay] = useState<string | null>(null);

    // Avatar State
    const [isTalking, setIsTalking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [aiMessage, setAiMessage] = useState("张爷爷，我在呢。有什么想聊的吗？");

    const [isRecording, setIsRecording] = useState(false);
    const [isDictating, setIsDictating] = useState(false);
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
    const [memories, setMemories] = useState<MemoryPhoto[]>(DEFAULT_MEMORIES);

    // Auto-scroll ref

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [aiMessage, voiceInputDisplay, isTalking]);

    // Sync Busy state to ProactiveService
    useEffect(() => {
        proactiveService.setBusy(isThinking || isTalking);
    }, [isThinking, isTalking]);

    // Global Activity Tracking (Reset idle timer on any click/touch)
    useEffect(() => {
        const handleActivity = () => {
            proactiveService.resetTimer();
        };

        window.addEventListener('mousedown', handleActivity);
        window.addEventListener('touchstart', handleActivity);
        window.addEventListener('keydown', handleActivity);

        return () => {
            window.removeEventListener('mousedown', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
            window.removeEventListener('keydown', handleActivity);
        };
    }, []);

    // Edge 预生成：确认音「嗯」等
    useEffect(() => {
        // EdgeTTS 已移除，不再预加载
    }, []);

    // 进入老人端：预拉常用句 + 延迟一次打招呼（仅播一次，避免 React Strict Mode 双挂载导致重复）
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
                    const greeting = '张爷爷，我是您的数字人助手。今天身体怎么样？';
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

    // Proactive Service Subscription
    useEffect(() => {
        // Start service
        proactiveService.start();

        // Immediate Trigger (Force)
        setTimeout(() => {
            proactiveService.triggerImmediately();
        }, 1000);

        const unsubscribe = proactiveService.subscribe((msg, type) => {
            if (activeScenario !== 'none') return; // Don't interrupt scenarios

            setAiMessage(msg);
            setIsTalking(true);

            // Speak the proactive message
            const voiceId = voiceSelectionService.getSelectedVoiceId();
            VoiceService.speak(msg, voiceId).catch(() => { });

            // Auto-hide talking state after a while if no interaction
            setTimeout(() => {
                if (isTalking) setIsTalking(false);
            }, 5000 + msg.length * 200);
        });

        return () => {
            unsubscribe();
            proactiveService.stop();
        };
    }, [activeScenario]); // Re-subscribe if scenario changes to ensure we don't miss updates, though proactive service is global---
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

    // 保存所有中间识别结果（用于整合处理）
    const interimResultsRef = useRef<string[]>([]);
    const lastRecognitionResultRef = useRef<SpeechRecognitionResult | null>(null);
    const finalResultTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isProcessingRef = useRef<boolean>(false); // 防止重复处理

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
                    switch (response.shouldTriggerAction) {
                        case 'nav':
                            // 替换为通知家人逻辑
                            setAiMessage('好的，为了您的安全，已通知您的家人（儿子）您的位置。请在原地稍候。');
                            setIsTalking(true);
                            // 不再启动导航场景
                            // setActiveScenario('nav');
                            break;
                        case 'meds':
                            setActiveScenario('meds');
                            setStep(0);
                            break;
                        case 'memory':
                            // Fetch memories based on location
                            const nearbyAnchors = memoryService.getMemoriesByLocation(CURRENT_LOCATION_MOCK.lat, CURRENT_LOCATION_MOCK.lng);
                            console.log('[App] Found nearby memories:', nearbyAnchors);

                            if (nearbyAnchors.length > 0) {
                                setMemories(nearbyAnchors.map(convertAnchorToPhoto));
                            } else {
                                setMemories(DEFAULT_MEMORIES);
                            }

                            setActiveScenario('memory');
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
    // --- Logic: Voice Interaction (Web Speech API) ---
    const toggleRecording = useCallback(() => {
        if (isRecording) {
            setIsRecording(false);
            webSpeechService.stop();
        } else {
            setIsRecording(true);
            setSpeechError(null);

            webSpeechService.start(
                (result) => {
                    setInterimText(result.transcript);
                    if (result.isFinal) {
                        setInterimText('');
                        setIsRecording(false);
                        handleVoiceResult(result.transcript);
                    }
                },
                (error) => {
                    setSpeechError(error);
                    setIsRecording(false);
                }
            );
        }
    }, [isRecording]);

    const handleSendMessage = (textOverride?: string) => {
        const text = textOverride || inputText;
        if (!text.trim() && !pendingMedia) return;

        proactiveService.resetTimer(); // Reset on send

        // Combine text and media
        const combinedContent = text.trim() || (pendingMedia?.type === 'image' ? '张爷爷分享了一张照片' : '张爷爷分享了一个视频');

        // Add user message to history
        setMessages(prev => [...prev, {
            role: 'user',
            content: combinedContent,
            type: pendingMedia?.type,
            mediaUrl: pendingMedia?.url
        }]);

        setInputText('');
        setPendingMedia(null);

        // AI Response Logic
        handleVoiceResult(combinedContent);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);

        // Just set pending media, don't send yet
        setPendingMedia({ type, url });
        setShowUploadMenu(false);
    };
    const handleVoiceResult = async (text: string) => {
        console.log('Voice Result:', text);
        setVoiceInputDisplay(text);
        setIsThinking(true);

        try {
            // Call AI Service
            const response = await aiService.chat(text);

            setIsThinking(false);
            setAiMessage(response.text);
            setIsTalking(true);

            // Add to chat history
            setMessages(prev => [...prev, { role: 'ai', content: response.text }]);

            // Speak response
            VoiceService.speak(response.text).catch(() => { });

            // Handle Actions
            if (response.shouldTriggerAction) {
                setTimeout(() => {
                    setActiveScenario(response.shouldTriggerAction as any);
                    setIsTalking(false);
                    setStep(0);
                }, 2000);
            } else {
                setTimeout(() => setIsTalking(false), 3000);
            }

        } catch (e) {
            setIsThinking(false);
            setAiMessage("抱歉，我没听清，请再说一遍。");
            setMessages(prev => [...prev, { role: 'ai', content: "抱歉，我没听清，请再说一遍。" }]);
        }
    };

    // Helper to trigger voice command flow (used by both real recognition and simulation)
    const triggerVoiceCommand = useCallback((userText: string, targetScenario: 'nav' | 'meds' | 'memory', aiResponse: string) => {
        proactiveService.resetTimer(); // Reset idle timer
        setVoiceInputDisplay(userText);
        // Simulate processing delay
        setIsThinking(true);
        setTimeout(() => {
            setIsThinking(false);
            setAiMessage(aiResponse);
            setIsTalking(true);
            setActiveScenario(targetScenario);

            // Speak reply
            VoiceService.speak(aiResponse).catch(() => { });

            setTimeout(() => {
                setIsTalking(false);
                // Start scenario flow
                setStep(0);
            }, 2000);
        }, 1000);
    }, []);



    // --- Logic: Map Initialization ---
    useEffect(() => {
        if (activeScenario === 'nav') {
            mapService.init().then(success => {
                if (success) {
                    setTimeout(async () => {
                        const map = await mapService.createMap('amap-container');
                        if (map) {
                            console.log('Map created');
                        }
                    }, 500); // Wait for container to render
                }
            });
        }
    }, [activeScenario]);

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
                {activeScenario === 'nav' && (
                    <div className="absolute inset-0 bg-white z-[60] flex flex-col animate-fade-in-up">
                        {/* Map Container */}
                        <div id="amap-container" className="flex-1 w-full bg-slate-100 flex items-center justify-center relative">
                            <p className="text-slate-400">正在加载地图...</p>
                            {/* Map rendered here */}
                        </div>
                        {/* Controls */}
                        <div className="p-4 bg-white shadow-lg rounded-t-3xl z-10">
                            <h3 className="text-lg font-bold mb-2">正在导航回家</h3>
                            <div className="flex gap-4">
                                <button onClick={() => { setActiveScenario('none'); setStep(0); }} className="flex-1 bg-slate-100 py-3 rounded-xl font-bold">退出</button>
                                <button className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30">开始导航</button>
                            </div>
                        </div>
                    </div>
                )}
                {activeScenario === 'meds' && (
                    <MedicationFlow
                        step={step}
                        onClose={() => {
                            setActiveScenario('none');
                            setStep(0);
                        }}
                    />
                )}
                {activeScenario === 'memory' && (
                    <MemoriesFlow
                        step={step}
                        memories={memories}
                        onClose={() => {
                            setActiveScenario('none');
                            setStep(0);
                            aiService.clearContext();
                        }}
                        onPrev={() => setStep(prev => prev > 0 ? prev - 1 : prev)}
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

                    {/* 单个动态 3D 数字人居中 */}
                    <div className="flex-1 flex items-center justify-center relative min-h-0 -mt-24 overflow-hidden">
                        <div className="relative flex items-center justify-center group cursor-pointer" onClick={() => setShowAvatarCreator(true)}>
                            <div className="transform scale-75 shrink-0">
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
                                {isListening ? "正在聆听..." : isThinking ? "思考中..." : "陪伴助手"}
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
                        <>
                            {/* Chat List Overlay */}
                            <div
                                ref={chatContainerRef}
                                className="absolute top-[65%] left-0 right-0 bottom-24 px-4 overflow-y-auto z-30 space-y-2 no-scrollbar gradient-mask-t"
                                style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%)' }}
                            >
                                <div className="h-1"></div> {/* Minimized spacer */}
                                {messages.map((msg, idx) => (
                                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm shadow-sm ${msg.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-tr-sm'
                                            : 'bg-white text-slate-700 rounded-tl-sm border border-slate-100'
                                            }`}>
                                            {msg.type === 'image' && msg.mediaUrl && (
                                                <div className="mb-2 rounded-lg overflow-hidden border border-white/20 shadow-sm max-h-24 max-w-[120px]">
                                                    <img src={msg.mediaUrl} alt="Upload" className="w-full h-full object-cover" />
                                                </div>
                                            )}
                                            {msg.type === 'video' && (
                                                <div className="mb-2 rounded-lg overflow-hidden bg-black flex items-center justify-center p-0.5 relative max-h-24 max-w-[120px]">
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center backdrop-blur-sm">
                                                            <div className="w-0 h-0 border-l-[6px] border-l-white border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent ml-0.5"></div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {msg.content}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Bottom Chat Input Bar */}
                            <div className="absolute bottom-0 left-0 right-0 bg-white z-50 rounded-t-[2rem] shadow-[0_-5px_30px_rgba(0,0,0,0.08)] p-4 pb-6 animate-fade-in-up">
                                {/* Media Staging Preview */}
                                {pendingMedia && (
                                    <div className="flex px-4 mb-4 animate-scale-in">
                                        <div className="relative group">
                                            <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-indigo-400 shadow-md">
                                                {pendingMedia.type === 'image' ? (
                                                    <img src={pendingMedia.url} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-slate-800 flex items-center justify-center">
                                                        <Box className="text-white/50" />
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => setPendingMedia(null)}
                                                className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white active:scale-90 transition-transform"
                                            >
                                                <span className="text-lg leading-none">×</span>
                                            </button>
                                        </div>
                                        <div className="ml-3 flex flex-col justify-center">
                                            <span className="text-xs font-bold text-indigo-600">已准备好发送</span>
                                            <span className="text-[10px] text-slate-400">点击发送按钮一起发出</span>
                                        </div>
                                    </div>
                                )}

                                {/* Upload Menu */}
                                {showUploadMenu && (
                                    <div className="flex gap-6 mb-6 px-4 justify-around animate-fade-in">
                                        <input
                                            type="file"
                                            ref={imageInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => handleFileUpload(e, 'image')}
                                        />
                                        <input
                                            type="file"
                                            ref={videoInputRef}
                                            className="hidden"
                                            accept="video/*"
                                            onChange={(e) => handleFileUpload(e, 'video')}
                                        />
                                        <button onClick={() => imageInputRef.current?.click()} className="flex flex-col items-center gap-2 group">
                                            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-500 group-active:scale-95 transition-transform shadow-sm border border-indigo-100">
                                                <ImageIcon size={24} />
                                            </div>
                                            <span className="text-xs font-bold text-slate-600">图片</span>
                                        </button>
                                        <button onClick={() => videoInputRef.current?.click()} className="flex flex-col items-center gap-2 group">
                                            <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 group-active:scale-95 transition-transform shadow-sm border border-rose-100">
                                                <Camera size={24} />
                                            </div>
                                            <span className="text-xs font-bold text-slate-600">视频</span>
                                        </button>
                                    </div>
                                )}

                                <div className="flex items-center gap-2 max-w-full">
                                    {/* Legacy Button - Restored */}
                                    <button
                                        onClick={() => {
                                            setAiMessage("张爷爷，好的，让我们一起翻翻老照片。");
                                            setIsTalking(true);
                                            setTimeout(() => setIsTalking(false), 2000);
                                            setActiveScenario('memory');
                                            setStep(0);
                                        }}
                                        className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 bg-yellow-50 text-yellow-600 border border-yellow-100"
                                    >
                                        <ImageIcon size={18} />
                                    </button>

                                    <button
                                        onClick={() => setShowUploadMenu(!showUploadMenu)}
                                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0 ${showUploadMenu ? 'bg-slate-200 text-slate-600 rotate-45' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}
                                    >
                                        <Box size={20} />
                                    </button>

                                    <div className="flex-1 bg-slate-50 rounded-2xl min-h-[44px] flex items-center px-3 py-2 border border-slate-200 focus-within:border-indigo-300 transition-colors gap-2 min-w-0">
                                        <input
                                            type="text"
                                            value={inputText}
                                            onChange={(e) => setInputText(e.target.value)}
                                            placeholder="想聊点什么？..."
                                            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 placeholder:text-slate-400 min-w-0"
                                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                        />
                                        {/* Voice Input (Dictation) Button */}
                                        <button
                                            onClick={() => {
                                                if (isDictating) {
                                                    webSpeechService.stop();
                                                    setIsDictating(false);
                                                } else {
                                                    setIsDictating(true);
                                                    webSpeechService.start(({ transcript, isFinal }) => {
                                                        setInputText(transcript); // Fill input
                                                        if (isFinal) {
                                                            setIsDictating(false);
                                                        }
                                                    });
                                                }
                                            }}
                                            className={`w-8 h-8 flex items-center justify-center rounded-full transition-all flex-shrink-0 ${isDictating ? 'text-rose-500 bg-rose-50 animate-pulse' : 'text-slate-400 hover:text-indigo-500'}`}
                                            title="语音转文字"
                                        >
                                            <Mic size={16} />
                                        </button>
                                    </div>

                                    <button
                                        onClick={toggleRecording}
                                        className={`w-11 h-11 rounded-full flex items-center justify-center text-white shadow-lg transition-all active:scale-90 shrink-0 ${isRecording ? 'bg-rose-500 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                    >
                                        <Mic size={22} />
                                    </button>
                                </div>
                            </div>
                        </>
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


                {/* 游荡警报 */}
                <WanderingAlert
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


                {/* 认知报告入口按钮 - 右上角 */}


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
