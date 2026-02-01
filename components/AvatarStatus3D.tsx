import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SystemStatus } from '../types';

interface AvatarStatus3DProps {
    status: SystemStatus;
    size?: number;
}

/**
 * 3D 老年数字人形象，用于子女端 Dashboard 总览。
 * 根据系统状态（正常/预警/危急）呈现不同动画效果。
 */
const AvatarStatus3D: React.FC<AvatarStatus3DProps> = ({ status, size = 110 }) => {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mountRef.current) return;

        // 清除可能存在的旧 canvas（如 React Strict Mode 双重挂载残留）
        while (mountRef.current.firstChild) {
            mountRef.current.removeChild(mountRef.current.firstChild);
        }

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
        camera.position.z = 5.5;
        camera.position.y = -0.2;

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(size, size);
        renderer.setPixelRatio(window.devicePixelRatio);
        mountRef.current.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(2, 5, 5);
        scene.add(dirLight);

        const charGroup = new THREE.Group();
        scene.add(charGroup);

        // --- Materials ---
        const skinMat = new THREE.MeshPhysicalMaterial({ color: 0xffe5d8, roughness: 0.5 });
        const hairMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6, metalness: 0.1 });
        const eyesMat = new THREE.MeshBasicMaterial({ color: 0x2d1b15 });
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0x4a2c2a });
        const tongueMat = new THREE.MeshBasicMaterial({ color: 0xe06c75 });

        const sweaterMat = new THREE.MeshStandardMaterial({ color: 0x2e3b4e, roughness: 0.9 });
        const sweaterRibMat = new THREE.MeshStandardMaterial({ color: 0x243040, roughness: 0.9 });
        const buttonMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.1 });

        const blushMat = new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.15 });
        const wrinkleMat = new THREE.MeshBasicMaterial({ color: 0xdeb8a6, transparent: true, opacity: 0.6 });

        // --- Head ---
        const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 32), skinMat);
        charGroup.add(head);

        // --- Neck ---
        const neckGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.6, 32);
        const neck = new THREE.Mesh(neckGeo, skinMat);
        neck.position.y = -1.0;
        charGroup.add(neck);

        // --- Body (Sweater) ---
        const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 32), sweaterMat);
        body.position.y = -1.7;
        body.scale.set(1.1, 1.1, 0.9);
        charGroup.add(body);

        // --- Buttons ---
        const buttonGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16);
        const createButton = (y: number, z: number, rotX: number) => {
            const b = new THREE.Mesh(buttonGeo, buttonMat);
            b.rotation.x = Math.PI / 2 + rotX;
            b.position.set(0, y, z);
            charGroup.add(b);
        };
        createButton(-1.35, 0.88, -0.2);
        createButton(-1.65, 0.94, -0.1);
        createButton(-1.95, 0.96, 0);
        createButton(-2.25, 0.91, 0.1);

        // --- Arms ---
        const armGeo = new THREE.CapsuleGeometry(0.17, 1.2, 4, 8);
        const handGeo = new THREE.SphereGeometry(0.16, 16, 16);

        const lArm = new THREE.Mesh(armGeo, sweaterMat);
        lArm.position.set(-1.0, -1.35, -0.1);
        lArm.rotation.set(-0.1, 0.1, -0.15);
        const lHand = new THREE.Mesh(handGeo, skinMat);
        lHand.position.y = -0.8;
        lArm.add(lHand);
        const lCuff = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 16), sweaterRibMat);
        lCuff.position.y = -0.65;
        lCuff.rotation.x = Math.PI / 2;
        lArm.add(lCuff);
        charGroup.add(lArm);

        const rArm = new THREE.Mesh(armGeo, sweaterMat);
        rArm.position.set(1.0, -1.35, -0.1);
        rArm.rotation.set(-0.1, -0.1, 0.15);
        const rHand = new THREE.Mesh(handGeo, skinMat);
        rHand.position.y = -0.8;
        rArm.add(rHand);
        const rCuff = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 16), sweaterRibMat);
        rCuff.position.y = -0.65;
        rCuff.rotation.x = Math.PI / 2;
        rArm.add(rCuff);
        charGroup.add(rArm);

        // --- Hair ---
        const hairGeo = new THREE.SphereGeometry(0.5, 16, 16);
        const createHairBlock = (
            x: number, y: number, z: number,
            sx: number, sy: number, sz: number,
            rx = 0, ry = 0, rz = 0
        ) => {
            const m = new THREE.Mesh(hairGeo, hairMat);
            m.position.set(x, y, z);
            m.scale.set(sx, sy, sz);
            m.rotation.set(rx, ry, rz);
            head.add(m);
        };
        createHairBlock(0.2, 1.15, 0.1, 2.1, 0.8, 1.8, 0, 0, -0.2);
        createHairBlock(-0.8, 1.0, 0.2, 1.1, 0.9, 1.4, 0, 0, 0.2);
        createHairBlock(0, 0.6, -0.8, 2.3, 1.8, 1.2);
        createHairBlock(-1.12, 0.4, 0.1, 0.3, 1.2, 0.8);
        createHairBlock(1.12, 0.4, 0.1, 0.3, 1.2, 0.8);

        // --- Face Features ---
        const eyeGeo = new THREE.CapsuleGeometry(0.08, 0.12, 4, 8);
        const lEye = new THREE.Mesh(eyeGeo, eyesMat);
        lEye.position.set(-0.35, 0.2, 1.12);
        head.add(lEye);
        const rEye = new THREE.Mesh(eyeGeo, eyesMat);
        rEye.position.set(0.35, 0.2, 1.12);
        head.add(rEye);

        const browGeo = new THREE.CapsuleGeometry(0.045, 0.28, 4, 8);
        const browMat = new THREE.MeshBasicMaterial({ color: 0x999999 });
        const lBrow = new THREE.Mesh(browGeo, browMat);
        lBrow.position.set(-0.35, 0.55, 1.15);
        lBrow.rotation.z = 1.65;
        head.add(lBrow);
        const rBrow = new THREE.Mesh(browGeo, browMat);
        rBrow.position.set(0.35, 0.55, 1.15);
        rBrow.rotation.z = -1.65;
        head.add(rBrow);

        const nose = new THREE.Mesh(
            new THREE.SphereGeometry(0.09, 16, 16),
            new THREE.MeshPhysicalMaterial({ color: 0xffd1c2, roughness: 0.5 })
        );
        nose.position.set(0, 0.1, 1.22);
        head.add(nose);

        const lineGeo = new THREE.TorusGeometry(0.5, 0.012, 4, 16, 0.8);
        const line1 = new THREE.Mesh(lineGeo, wrinkleMat);
        line1.position.set(0, 0.8, 1.1);
        line1.rotation.z = Math.PI / 2 + 2.74;
        line1.rotation.x = -0.3;
        head.add(line1);
        const line2 = new THREE.Mesh(lineGeo, wrinkleMat);
        line2.position.set(0, 0.95, 1.05);
        line2.rotation.z = Math.PI / 2 + 2.74;
        line2.rotation.x = -0.4;
        head.add(line2);

        const cheekGeo = new THREE.CircleGeometry(0.25, 32);
        const lCheek = new THREE.Mesh(cheekGeo, blushMat);
        lCheek.position.set(-0.7, -0.05, 1.05);
        lCheek.rotation.y = -0.4;
        head.add(lCheek);
        const rCheek = new THREE.Mesh(cheekGeo, blushMat);
        rCheek.position.set(0.7, -0.05, 1.05);
        rCheek.rotation.y = 0.4;
        head.add(rCheek);

        const mouthGroup = new THREE.Group();
        const mouthShape = new THREE.Mesh(new THREE.CircleGeometry(0.12, 32, 0, Math.PI), mouthMat);
        mouthShape.rotation.z = Math.PI;
        mouthGroup.add(mouthShape);
        const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.08, 32, 0, Math.PI), tongueMat);
        tongue.rotation.z = Math.PI;
        tongue.position.y = -0.04;
        tongue.position.z = 0.01;
        mouthGroup.add(tongue);
        mouthGroup.position.set(0, -0.25, 1.18);
        mouthGroup.rotation.x = -0.1;
        head.add(mouthGroup);

        const beardGroup = new THREE.Group();
        head.add(beardGroup);
        const beardGeo = new THREE.ConeGeometry(0.18, 0.35, 64);
        const chinBeard = new THREE.Mesh(beardGeo, hairMat);
        chinBeard.position.set(0, -1.08, 0.92);
        chinBeard.rotation.x = Math.PI + 0.15;
        chinBeard.scale.set(1, 1, 0.5);
        beardGroup.add(chinBeard);

        const earGeo = new THREE.SphereGeometry(0.25, 32, 32);
        const lEar = new THREE.Mesh(earGeo, skinMat);
        lEar.position.set(-1.18, 0.1, 0);
        lEar.scale.z = 0.5;
        head.add(lEar);
        const rEar = new THREE.Mesh(earGeo, skinMat);
        rEar.position.set(1.18, 0.1, 0);
        rEar.scale.z = 0.5;
        head.add(rEar);

        let frameId: number;
        const clock = new THREE.Clock();

        const animate = () => {
            frameId = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();

            if (status === SystemStatus.NORMAL) {
                charGroup.position.y = Math.sin(t * 1.5) * 0.05;
                charGroup.rotation.y = Math.sin(t * 0.5) * 0.08;
                head.rotation.x = Math.sin(t * 0.3) * 0.05;
                lArm.rotation.x = -0.1 + Math.sin(t * 1.5) * 0.05;
                rArm.rotation.x = -0.1 - Math.sin(t * 1.5) * 0.05;
            } else if (status === SystemStatus.WARNING) {
                charGroup.position.y = Math.sin(t * 3.0) * 0.08;
                charGroup.rotation.y = Math.sin(t * 2.0) * 0.15;
                head.rotation.y = Math.sin(t * 4.0) * 0.2;
            } else if (status === SystemStatus.CRITICAL) {
                charGroup.position.y = -0.5 + Math.sin(t * 5.0) * 0.02;
                charGroup.rotation.z = Math.sin(t * 8.0) * 0.05;
                head.rotation.x = 0.4;
            }

            if (Math.random() > 0.99) {
                lEye.scale.y = rEye.scale.y = 0.1;
            } else {
                lEye.scale.y = rEye.scale.y = THREE.MathUtils.lerp(lEye.scale.y, 1.0, 0.2);
            }

            renderer.render(scene, camera);
        };
        animate();

        return () => {
            cancelAnimationFrame(frameId);
            renderer.dispose();
            if (mountRef.current?.contains(renderer.domElement)) {
                mountRef.current.removeChild(renderer.domElement);
            }
        };
    }, [status, size]);

    return <div ref={mountRef} style={{ width: size, height: size }} />;
};

export default AvatarStatus3D;
