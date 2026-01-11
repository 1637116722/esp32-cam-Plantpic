import { useEffect, useRef, memo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getTimeTheme } from "../../utils/timeTheme";



interface Character3DProps {
    modelPath: string;
}

export const Character3D = memo(function Character3D({ modelPath }: Character3DProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const theme = getTimeTheme();
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const scene = new THREE.Scene();

        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        camera.position.set(0, 0, 4);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({ 
            alpha: true, 
            antialias: false, // 關閉抗鋸齒以提升捲動效能
            powerPreference: 'high-performance',
            precision: 'mediump'
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制像素比最高為 2
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.style.touchAction = 'none'; // 徹底禁用觸控衝突
        containerRef.current.appendChild(renderer.domElement);

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, theme.ambient * 0.8)); // 稍微降低環境光

        const dirLight = new THREE.DirectionalLight(0xffffff, theme.directional);
        dirLight.position.set(5, 8, 5);
        // 確保不產生陰影，減少計算量
        dirLight.castShadow = false; 
        scene.add(dirLight);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableZoom = false;
        controls.enablePan = false;
        controls.enableDamping = true; // 加入阻尼讓轉動更順
        controls.dampingFactor = 0.05;
        controls.enabled = false; // 預設禁用，捲動時不應觸發
        controls.target.set(0, 0, 0);
        controls.update();

        const loader = new GLTFLoader();
        let model: THREE.Object3D | null = null;
        let sphereRadius = 0;
        let baseY = 0;
        let mixer: THREE.AnimationMixer | null = null;
        const group = new THREE.Group();
        scene.add(group);
        let rShoulder: THREE.Bone | null = null;
        let rUpperArm: THREE.Bone | null = null;
        let rLowerArm: THREE.Bone | null = null;
        let rHand: THREE.Bone | null = null;
        let lShoulder: THREE.Bone | null = null;
        let lUpperArm: THREE.Bone | null = null;
        let lLowerArm: THREE.Bone | null = null;
        let lHand: THREE.Bone | null = null;
        let rUpperLeg: THREE.Bone | null = null;
        let rLowerLeg: THREE.Bone | null = null;
        let rFoot: THREE.Bone | null = null;
        let lUpperLeg: THREE.Bone | null = null;
        let lLowerLeg: THREE.Bone | null = null;
        let lFoot: THREE.Bone | null = null;
        const baseRot = {
            rShoulder: new THREE.Euler(),
            rUpperArm: new THREE.Euler(),
            rLowerArm: new THREE.Euler(),
            rHand: new THREE.Euler(),
            lShoulder: new THREE.Euler(),
            lUpperArm: new THREE.Euler(),
            lLowerArm: new THREE.Euler(),
            lHand: new THREE.Euler(),
            rUpperLeg: new THREE.Euler(),
            rLowerLeg: new THREE.Euler(),
            rFoot: new THREE.Euler(),
            lUpperLeg: new THREE.Euler(),
            lLowerLeg: new THREE.Euler(),
            lFoot: new THREE.Euler(),
        };

        loader.load(modelPath, gltf => {
            model = gltf.scene;

            const box = new THREE.Box3().setFromObject(model);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());

            model.position.sub(center);

            // Increase scale to make character larger (was 2, now 2.5)
            const scale = 2.5 / Math.max(size.x, size.y, size.z);
            model.scale.setScalar(scale);
            const scaledHeight = size.y * scale;
            baseY = -scaledHeight * 0.35;
            group.position.y = baseY;

            const sphere = box.getBoundingSphere(new THREE.Sphere());
            sphereRadius = sphere.radius * scale;
            const vFov = THREE.MathUtils.degToRad(camera.fov);
            const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
            const dVert = sphereRadius / Math.tan(vFov / 2);
            const dHoriz = sphereRadius / Math.tan(hFov / 2);
            const distance = Math.max(dVert, dHoriz) * 1.2;
            camera.position.set(0, 0, distance);
            camera.lookAt(0, 0, 0);
            controls.update();

            group.add(model);

            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(model);
                const walkClip =
                    gltf.animations.find(a => a.name.toLowerCase().includes("walk")) ||
                    gltf.animations.find(a => a.name.toLowerCase().includes("run")) ||
                    gltf.animations[0];
                const action = mixer.clipAction(walkClip);
                action.reset().play();
            } else {
                let skinnedMesh: any = null;
                model.traverse(obj => {
                    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
                        skinnedMesh = obj;
                    }
                });
                if (skinnedMesh && (skinnedMesh as THREE.SkinnedMesh).skeleton) {
                    const bones = (skinnedMesh as THREE.SkinnedMesh).skeleton.bones;
                    const find = (candidates: string[]) =>
                        bones.find((b: any) => candidates.some(n => b.name.includes(n))) || null;
                    rShoulder = find([
                        "RightShoulder",
                        "mixamorigRightShoulder",
                        "Shoulder_R",
                        "RightArm",
                        "mixamorigRightArm",
                    ]);
                    rUpperArm = find([
                        "RightUpperArm",
                        "UpperArm_R",
                        "mixamorigRightArm",
                    ]);
                    rLowerArm = find([
                        "RightLowerArm",
                        "RightForeArm",
                        "ForeArm_R",
                        "mixamorigRightForeArm",
                    ]);
                    rHand = find([
                        "RightHand",
                        "Hand_R",
                        "RightWrist",
                        "Wrist_R",
                        "mixamorigRightHand",
                    ]);
                    lShoulder = find([
                        "LeftShoulder",
                        "mixamorigLeftShoulder",
                        "Shoulder_L",
                        "LeftArm",
                        "mixamorigLeftArm",
                    ]);
                    lUpperArm = find([
                        "LeftUpperArm",
                        "UpperArm_L",
                        "mixamorigLeftArm",
                    ]);
                    lLowerArm = find([
                        "LeftLowerArm",
                        "LeftForeArm",
                        "ForeArm_L",
                        "mixamorigLeftForeArm",
                    ]);
                    lHand = find([
                        "LeftHand",
                        "Hand_L",
                        "LeftWrist",
                        "Wrist_L",
                        "mixamorigLeftHand",
                    ]);
                    rUpperLeg = find([
                        "RightUpperLeg",
                        "RightUpLeg",
                        "UpLeg_R",
                        "mixamorigRightUpLeg",
                    ]);
                    rLowerLeg = find([
                        "RightLowerLeg",
                        "RightLeg",
                        "Leg_R",
                        "mixamorigRightLeg",
                    ]);
                    rFoot = find([
                        "RightFoot",
                        "Foot_R",
                        "mixamorigRightFoot",
                    ]);
                    lUpperLeg = find([
                        "LeftUpperLeg",
                        "LeftUpLeg",
                        "UpLeg_L",
                        "mixamorigLeftUpLeg",
                    ]);
                    lLowerLeg = find([
                        "LeftLowerLeg",
                        "LeftLeg",
                        "Leg_L",
                        "mixamorigLeftLeg",
                    ]);
                    lFoot = find([
                        "LeftFoot",
                        "Foot_L",
                        "mixamorigLeftFoot",
                    ]);
                    if (rShoulder) baseRot.rShoulder.copy(rShoulder.rotation);
                    if (rUpperArm) baseRot.rUpperArm.copy(rUpperArm.rotation);
                    if (rLowerArm) baseRot.rLowerArm.copy(rLowerArm.rotation);
                    if (rHand) baseRot.rHand.copy(rHand.rotation);
                    if (lShoulder) baseRot.lShoulder.copy(lShoulder.rotation);
                    if (lUpperArm) baseRot.lUpperArm.copy(lUpperArm.rotation);
                    if (lLowerArm) baseRot.lLowerArm.copy(lLowerArm.rotation);
                    if (lHand) baseRot.lHand.copy(lHand.rotation);
                    if (rUpperLeg) baseRot.rUpperLeg.copy(rUpperLeg.rotation);
                    if (rLowerLeg) baseRot.rLowerLeg.copy(rLowerLeg.rotation);
                    if (rFoot) baseRot.rFoot.copy(rFoot.rotation);
                    if (lUpperLeg) baseRot.lUpperLeg.copy(lUpperLeg.rotation);
                    if (lLowerLeg) baseRot.lLowerLeg.copy(lLowerLeg.rotation);
                    if (lFoot) baseRot.lFoot.copy(lFoot.rotation);
                }
            }
        });

        const clock = new THREE.Clock();
        let animationId = 0;
        const animate = () => {
            animationId = requestAnimationFrame(animate);
            const t = clock.getElapsedTime();
            group.position.y = baseY + Math.sin(t) * 0.05;
            const delta = clock.getDelta();
            if (mixer) {
                mixer.update(delta);
            } else {
                const wave = (amp: number, speed: number, phase: number) =>
                    Math.sin(t * speed + phase) * amp;
                const speed = 2.0;
                const armAmpX = 0.35;
                const armAmpZ = 0.15;
                const legAmpX = 0.45;
                const kneeAmpX = 0.35;
                const footAmpX = 0.2;
                if (rShoulder) {
                    rShoulder.rotation.set(
                        baseRot.rShoulder.x + wave(armAmpX, speed, 0),
                        baseRot.rShoulder.y,
                        baseRot.rShoulder.z + wave(armAmpZ, speed, 0)
                    );
                }
                if (lShoulder) {
                    lShoulder.rotation.set(
                        baseRot.lShoulder.x + wave(armAmpX, speed, Math.PI),
                        baseRot.lShoulder.y,
                        baseRot.lShoulder.z + wave(armAmpZ, speed, Math.PI)
                    );
                }
                if (rUpperArm) {
                    rUpperArm.rotation.x = baseRot.rUpperArm.x + wave(armAmpX, speed, 0);
                }
                if (lUpperArm) {
                    lUpperArm.rotation.x = baseRot.lUpperArm.x + wave(armAmpX, speed, Math.PI);
                }
                if (rLowerArm) {
                    rLowerArm.rotation.x = baseRot.rLowerArm.x + wave(armAmpX * 0.6, speed, 0.2);
                }
                if (lLowerArm) {
                    lLowerArm.rotation.x = baseRot.lLowerArm.x + wave(armAmpX * 0.6, speed, Math.PI + 0.2);
                }
                if (rHand) {
                    rHand.rotation.x = baseRot.rHand.x + wave(armAmpX * 0.3, speed, 0.4);
                }
                if (lHand) {
                    lHand.rotation.x = baseRot.lHand.x + wave(armAmpX * 0.3, speed, Math.PI + 0.4);
                }
                if (rUpperLeg) {
                    rUpperLeg.rotation.x = baseRot.rUpperLeg.x + wave(legAmpX, speed, Math.PI);
                }
                if (lUpperLeg) {
                    lUpperLeg.rotation.x = baseRot.lUpperLeg.x + wave(legAmpX, speed, 0);
                }
                if (rLowerLeg) {
                    rLowerLeg.rotation.x = baseRot.rLowerLeg.x + wave(kneeAmpX, speed, Math.PI + 0.5);
                }
                if (lLowerLeg) {
                    lLowerLeg.rotation.x = baseRot.lLowerLeg.x + wave(kneeAmpX, speed, 0.5);
                }
                if (rFoot) {
                    rFoot.rotation.x = baseRot.rFoot.x + wave(footAmpX, speed, Math.PI + 0.8);
                }
                if (lFoot) {
                    lFoot.rotation.x = baseRot.lFoot.x + wave(footAmpX, speed, 0.8);
                }
            }
            renderer.render(scene, camera);
        };
        animate();

        const onResize = () => {
            if (!containerRef.current) return;
            const w = containerRef.current.clientWidth;
            const h = containerRef.current.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            if (sphereRadius > 0) {
                const vFov = THREE.MathUtils.degToRad(camera.fov);
                const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
                const dVert = sphereRadius / Math.tan(vFov / 2);
                const dHoriz = sphereRadius / Math.tan(hFov / 2);
                const distance = Math.max(dVert, dHoriz) * 1.2;
                camera.position.set(0, 0, distance);
                camera.lookAt(0, 0, 0);
                controls.update();
            }
        };
        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('resize', onResize);
            controls.dispose();
            mixer?.stopAllAction();
            if (model) {
                model.traverse(obj => {
                    if ((obj as THREE.Mesh).isMesh) {
                        const mesh = obj as THREE.Mesh;
                        if (mesh.geometry) {
                            mesh.geometry.dispose();
                        }
                        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                        mats.forEach(m => {
                            if (!m) return;
                            const mat = m as THREE.Material & Record<string, any>;
                            for (const key in mat) {
                                const v = mat[key];
                                if (v && (v as any).isTexture) {
                                    (v as THREE.Texture).dispose();
                                }
                            }
                            (m as THREE.Material).dispose();
                        });
                    }
                });
                group.remove(model);
            }
            scene.remove(group);
            cancelAnimationFrame(animationId);
            renderer.dispose();
            containerRef.current?.replaceChildren();
        };
    }, [modelPath]);

    return (
        <div 
            ref={containerRef} 
            className="w-full h-full" 
            style={{ 
                WebkitBackfaceVisibility: 'hidden',
                perspective: '1000px',
                transformStyle: 'preserve-3d'
            }} 
        />
    );
});
