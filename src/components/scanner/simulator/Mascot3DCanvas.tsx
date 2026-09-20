"use client";

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { HarnessType, CanvasCoord, MascotReaction } from '@/lib/scanner/simulator/types';

interface Mascot3DCanvasProps {
  harness: HarnessType;
  targetCoord: CanvasCoord;
  reaction?: MascotReaction;
  width: number;
  height: number;
  replaySpeed?: number;
}

export default function Mascot3DCanvas({
  harness,
  targetCoord,
  reaction = 'idle',
  width,
  height,
  replaySpeed = 1,
}: Mascot3DCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const targetPosRef = useRef<CanvasCoord>(targetCoord);
  const reactionRef = useRef<MascotReaction>(reaction);
  const harnessRef = useRef<HarnessType>(harness);
  const replaySpeedRef = useRef<number>(replaySpeed);

  useEffect(() => {
    replaySpeedRef.current = replaySpeed;
  }, [replaySpeed]);

  useEffect(() => {
    targetPosRef.current = {
      x: Math.max(42, Math.min(Math.max(100, width - 42), targetCoord.x)),
      y: Math.max(42, Math.min(Math.max(100, height - 42), targetCoord.y)),
    };
  }, [targetCoord, width, height]);

  useEffect(() => {
    reactionRef.current = reaction;
  }, [reaction]);

  useEffect(() => {
    harnessRef.current = harness;
  }, [harness]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || width <= 0 || height <= 0) return;

    // ─── 1. Scene & Orthographic Camera ──────────────────────────────────────
    const scene = new THREE.Scene();

    const camera = new THREE.OrthographicCamera(0, width, 0, height, -1000, 1000);
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // ─── 2. Lighting Setup ───────────────────────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(-180, -220, 450);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff4400, 0.7);
    rimLight.position.set(220, 220, 300);
    scene.add(rimLight);

    // ─── 3. Shadow Mesh on Canvas Floor ──────────────────────────────────────
    const shadowGeo = new THREE.CircleGeometry(16, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.38,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(targetCoord.x, targetCoord.y, 0.5);
    scene.add(shadowMesh);

    // ─── 4. Mascot Group Structure ───────────────────────────────────────────
    const mascotRoot = new THREE.Group();
    mascotRoot.position.set(targetCoord.x, targetCoord.y, 20);
    scene.add(mascotRoot);

    // Articulated components for micro-interactions
    let headJoint: THREE.Group = new THREE.Group();
    let legParts: THREE.Mesh[] = [];
    let armParts: THREE.Mesh[] = [];
    let eyeMeshes: THREE.Mesh[] = [];
    let radarBeam: THREE.Mesh | null = null;
    let thinkingAura: THREE.Group | null = null;
    let statusLed: THREE.Mesh | null = null;

    function buildMascot(type: HarnessType) {
      while (mascotRoot.children.length > 0) {
        mascotRoot.remove(mascotRoot.children[0]);
      }
      legParts = [];
      armParts = [];
      eyeMeshes = [];
      radarBeam = null;
      thinkingAura = null;
      statusLed = null;

      const innerGroup = new THREE.Group();
      innerGroup.rotation.x = 0;
      innerGroup.rotation.y = 0;

      headJoint = new THREE.Group();
      headJoint.position.set(0, -6, 16);
      innerGroup.add(headJoint);

      if (type === 'claude-code') {
        // ── Claude Code: Iconic Orange Box-Bot ──
        const orangeMat = new THREE.MeshStandardMaterial({
          color: 0xff4d00,
          roughness: 0.22,
          metalness: 0.1,
        });
        const darkTrimMat = new THREE.MeshStandardMaterial({ color: 0xc43600 });
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111114 });

        // Head Box (Iconic Box-Bot Body, 34 x 26 x 20)
        const headGeo = new THREE.BoxGeometry(32, 24, 20);
        const headMesh = new THREE.Mesh(headGeo, orangeMat);
        headJoint.add(headMesh);

        // Antenna slit on top left
        const slitGeo = new THREE.BoxGeometry(2.5, 7, 2.5);
        const slitMesh = new THREE.Mesh(slitGeo, darkTrimMat);
        slitMesh.position.set(-6, -14, 2);
        headJoint.add(slitMesh);

        // Characteristic Inset Eyes on front face (+Z)
        const eyeGeo = new THREE.BoxGeometry(4.5, 6, 2.5);
        const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
        eyeL.position.set(-6, -1, 10.2);
        headJoint.add(eyeL);
        eyeMeshes.push(eyeL);

        const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
        eyeR.position.set(8, -1, 10.2);
        headJoint.add(eyeR);
        eyeMeshes.push(eyeR);

        // Left & Right Arms
        const armGeo = new THREE.BoxGeometry(7, 10, 8);
        const armL = new THREE.Mesh(armGeo, orangeMat);
        armL.position.set(-19, 2, 10);
        innerGroup.add(armL);
        armParts.push(armL);

        const armR = new THREE.Mesh(armGeo, orangeMat);
        armR.position.set(19, 2, 10);
        innerGroup.add(armR);
        armParts.push(armR);

        // 4 Blocky Stepping Feet Grounded on Floor
        const legGeo = new THREE.BoxGeometry(5.5, 9, 5.5);
        [
          [-8, 14, 14],
          [-8, 14, 6],
          [8, 14, 14],
          [8, 14, 6],
        ].forEach(([lx, ly, lz]) => {
          const leg = new THREE.Mesh(legGeo, orangeMat);
          leg.position.set(lx, ly, lz);
          innerGroup.add(leg);
          legParts.push(leg);
        });

      } else if (type === 'openclaw') {
        // ── OpenClaw: Iconic Crimson Sphere-Bot ──
        const redMat = new THREE.MeshStandardMaterial({
          color: 0xee2c2c,
          roughness: 0.18,
          metalness: 0.15,
        });
        const cyanMat = new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x22d3ee,
          emissiveIntensity: 2.4,
        });

        // Spherical Body (Iconic radius 17)
        const sphereGeo = new THREE.SphereGeometry(17, 32, 32);
        const bodyMesh = new THREE.Mesh(sphereGeo, redMat);
        headJoint.add(bodyMesh);

        // Cyan Glowing Circular Eye Lenses on Front Face (+Z)
        const eyeGeo = new THREE.CylinderGeometry(3, 3, 1.8, 16);
        eyeGeo.rotateX(Math.PI / 2);
        const eyeL = new THREE.Mesh(eyeGeo, cyanMat);
        eyeL.position.set(-5.5, 0, 16.5);
        headJoint.add(eyeL);
        eyeMeshes.push(eyeL);

        const eyeR = new THREE.Mesh(eyeGeo, cyanMat);
        eyeR.position.set(5.5, 0, 16.5);
        headJoint.add(eyeR);
        eyeMeshes.push(eyeR);

        // Dual Symmetrical Antennae pointing UP (-Y)
        const antGeo = new THREE.CylinderGeometry(0.8, 1.2, 8, 8);
        const antL = new THREE.Mesh(antGeo, redMat);
        antL.position.set(-6, -18, 0);
        antL.rotation.z = -0.35;
        headJoint.add(antL);

        const antR = new THREE.Mesh(antGeo, redMat);
        antR.position.set(6, -18, 0);
        antR.rotation.z = 0.35;
        headJoint.add(antR);

        // Floating Spherical Hands
        const handGeo = new THREE.SphereGeometry(4.5, 16, 16);
        const handL = new THREE.Mesh(handGeo, redMat);
        handL.position.set(-21, 2, 12);
        innerGroup.add(handL);
        armParts.push(handL);

        const handR = new THREE.Mesh(handGeo, redMat);
        handR.position.set(21, 2, 12);
        innerGroup.add(handR);
        armParts.push(handR);

        // Stubby Feet Grounded on Floor
        const legGeo = new THREE.CylinderGeometry(3.5, 3.5, 7, 16);
        const leg1 = new THREE.Mesh(legGeo, redMat);
        leg1.position.set(-5.5, 15, 10);
        innerGroup.add(leg1);
        legParts.push(leg1);

        const leg2 = new THREE.Mesh(legGeo, redMat);
        leg2.position.set(5.5, 15, 10);
        innerGroup.add(leg2);
        legParts.push(leg2);

      } else if (type === 'hermes') {
        // ── Hermes Agent: Upright Nous Girl Chibi 3D Figure ──
        const hairMat = new THREE.MeshStandardMaterial({
          color: 0x111116,
          roughness: 0.3,
          metalness: 0.1,
        });
        const skinMat = new THREE.MeshStandardMaterial({
          color: 0xffe4d0,
          roughness: 0.6,
        });
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
        const collarMat = new THREE.MeshStandardMaterial({ color: 0x18181b });

        // Face & Chibi Head (at headJoint y = -6)
        const faceGeo = new THREE.SphereGeometry(11, 24, 24);
        const faceMesh = new THREE.Mesh(faceGeo, skinMat);
        faceMesh.scale.set(1, 1.05, 0.95);
        headJoint.add(faceMesh);

        // Hair: Back & Bangs
        const hairGeo = new THREE.SphereGeometry(12, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.75);
        const hairMesh = new THREE.Mesh(hairGeo, hairMat);
        hairMesh.position.set(0, -2, -1);
        headJoint.add(hairMesh);

        // Over-Ear Headphones Arc & Earcups
        const arcGeo = new THREE.TorusGeometry(12.5, 1.5, 8, 24, Math.PI);
        const arcMesh = new THREE.Mesh(arcGeo, whiteMat);
        arcMesh.position.set(0, -3, 0);
        headJoint.add(arcMesh);

        const cupGeo = new THREE.CylinderGeometry(3.5, 3.5, 2.5, 16);
        cupGeo.rotateZ(Math.PI / 2);
        const cupL = new THREE.Mesh(cupGeo, collarMat);
        cupL.position.set(-12, -1, 0);
        headJoint.add(cupL);

        const cupR = new THREE.Mesh(cupGeo, collarMat);
        cupR.position.set(12, -1, 0);
        headJoint.add(cupR);

        // Torso with White Collared Shirt
        const torsoGeo = new THREE.CylinderGeometry(6, 8, 10, 16);
        const torsoMesh = new THREE.Mesh(torsoGeo, whiteMat);
        torsoMesh.position.set(0, 5, 14);
        innerGroup.add(torsoMesh);

        // Iconic "N" Collar Neckband
        const neckGeo = new THREE.CylinderGeometry(4, 4, 2.5, 16);
        const neckMesh = new THREE.Mesh(neckGeo, collarMat);
        neckMesh.position.set(0, 0, 14);
        innerGroup.add(neckMesh);

        // Feet / Shoes (+Y is screen DOWN)
        const footGeo = new THREE.BoxGeometry(3.5, 4, 6);
        const footL = new THREE.Mesh(footGeo, collarMat);
        footL.position.set(-4, 13, 14);
        innerGroup.add(footL);
        legParts.push(footL);

        const footR = new THREE.Mesh(footGeo, collarMat);
        footR.position.set(4, 13, 14);
        innerGroup.add(footR);
        legParts.push(footR);

        // Avatar Plate Badge on Front
        const loader = new THREE.TextureLoader();
        loader.load('/mascots/hermes.png', (tex) => {
          const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.scale.set(20, 20, 1);
          sprite.position.set(0, 0, 12);
          headJoint.add(sprite);
        });

      } else {
        // ── OpenCode: Upright Monolithic Terminal Drone ──
        const carbonMat = new THREE.MeshStandardMaterial({
          color: 0x18181b,
          roughness: 0.35,
          metalness: 0.8,
        });
        const screenMat = new THREE.MeshStandardMaterial({
          color: 0x052e16,
          emissive: 0x10b981,
          emissiveIntensity: 1.8,
        });
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });

        // Terminal Box Head (y = -6)
        const cubeGeo = new THREE.BoxGeometry(24, 20, 16);
        const cubeMesh = new THREE.Mesh(cubeGeo, carbonMat);
        headJoint.add(cubeMesh);

        // Glowing Green CRT Screen facing Front (+Z)
        const scrGeo = new THREE.BoxGeometry(18, 14, 1.5);
        const scrMesh = new THREE.Mesh(scrGeo, screenMat);
        scrMesh.position.set(0, 0, 8.5);
        headJoint.add(scrMesh);

        // Top Antenna pointing UP (-Y) with Status LED
        const antPostGeo = new THREE.CylinderGeometry(0.8, 0.8, 6, 8);
        const antPost = new THREE.Mesh(antPostGeo, carbonMat);
        antPost.position.set(0, -13, 0);
        headJoint.add(antPost);

        const ledGeo = new THREE.SphereGeometry(2, 12, 12);
        statusLed = new THREE.Mesh(ledGeo, ledMat);
        statusLed.position.set(0, -17, 0);
        headJoint.add(statusLed);

        // Floating Magnetic Hover Ring below terminal
        const ringGeo = new THREE.TorusGeometry(16, 1.2, 12, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981, wireframe: true });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        ringMesh.position.set(0, 9, 14);
        innerGroup.add(ringMesh);

        // Hover Struts
        const strutGeo = new THREE.BoxGeometry(3, 4, 3);
        const strut1 = new THREE.Mesh(strutGeo, carbonMat);
        strut1.position.set(-6, 13, 14);
        innerGroup.add(strut1);

        const strut2 = new THREE.Mesh(strutGeo, carbonMat);
        strut2.position.set(6, 13, 14);
        innerGroup.add(strut2);
      }

      // Radar Scan Beam (points down from head towards node)
      const coneGeo = new THREE.ConeGeometry(18, 36, 16, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      radarBeam = new THREE.Mesh(coneGeo, coneMat);
      radarBeam.position.set(0, 16, 8);
      radarBeam.visible = false;
      headJoint.add(radarBeam);

      // Thinking Aura Ring (activated during 'thinking' around head)
      thinkingAura = new THREE.Group();
      const auraGeo = new THREE.TorusGeometry(15, 0.9, 8, 24);
      const auraMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
      const auraRing = new THREE.Mesh(auraGeo, auraMat);
      auraRing.rotation.x = Math.PI / 2;
      thinkingAura.add(auraRing);
      thinkingAura.position.set(0, -14, 0);
      thinkingAura.visible = false;
      headJoint.add(thinkingAura);

      mascotRoot.add(innerGroup);
    }

    buildMascot(harness);

    // ─── 5. Physics Movement & Micro-Action Animation Loop ────────────────────
    let animId: number;
    const clock = new THREE.Clock();
    let currentHarness = harness;

    // Physics state
    let vx = 0;
    let vy = 0;
    const friction = 0.88;
    const maxSpeed = 5.2;

    // Micro-action timers
    let nodTimer = 0;
    let nopeTimer = 0;
    let prevReaction: MascotReaction = 'idle';

    const animate = () => {
      animId = requestAnimationFrame(animate);

      if (harnessRef.current !== currentHarness) {
        currentHarness = harnessRef.current;
        buildMascot(currentHarness);
      }

      const elapsed = clock.getElapsedTime();
      const target = targetPosRef.current;
      const curReaction = reactionRef.current;

      // Track reaction changes to trigger micro-actions
      if (curReaction !== prevReaction) {
        if (curReaction === 'nod') nodTimer = 0.85;
        if (curReaction === 'nope') nopeTimer = 0.95;
        prevReaction = curReaction;
      }

      // Physics distance calculation
      const dx = target.x - mascotRoot.position.x;
      const dy = target.y - mascotRoot.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isMoving = dist > 2.5;

      const innerGroup = mascotRoot.children[0] as THREE.Group | undefined;
      const speedMult = Math.min(4, Math.max(1, replaySpeedRef.current));

      if (isMoving) {
        // Dynamic speed proportional to distance and replaySpeed multiplier:
        // Ensures mascot arrives in sync even over wide gaps or at 2x/4x speed
        const baseMax = Math.max(14, Math.min(42, dist * 0.22));
        const currentMaxSpeed = baseMax * speedMult;

        const desiredSpeed = Math.min(currentMaxSpeed, dist * 0.28);
        const angle = Math.atan2(dy, dx);
        const targetVx = Math.cos(angle) * desiredSpeed;
        const targetVy = Math.sin(angle) * desiredSpeed;

        // Snappy responsive acceleration
        const accel = Math.min(0.38, 0.22 * Math.sqrt(speedMult));
        vx += (targetVx - vx) * accel;
        vy += (targetVy - vy) * accel;

        mascotRoot.position.x += vx;
        mascotRoot.position.y += vy;

        // Subtle yaw orientation and banking into turns
        if (innerGroup) {
          const targetYaw = Math.max(-0.35, Math.min(0.35, (vx / currentMaxSpeed) * 0.35));
          const targetPitch = Math.max(-0.12, Math.min(0.12, (vy / currentMaxSpeed) * 0.12));
          innerGroup.rotation.y = THREE.MathUtils.lerp(innerGroup.rotation.y, targetYaw, 0.18);
          innerGroup.rotation.x = THREE.MathUtils.lerp(innerGroup.rotation.x, targetPitch, 0.18);
        }
        const targetBank = Math.max(-0.12, Math.min(0.12, (vx / currentMaxSpeed) * 0.12));
        mascotRoot.rotation.z = THREE.MathUtils.lerp(mascotRoot.rotation.z, targetBank, 0.16);

        // Walking strides tied to speed and multiplier
        const speed = Math.sqrt(vx * vx + vy * vy);
        const strideRate = 18 * Math.min(2.5, Math.max(1, speedMult));
        legParts.forEach((leg, i) => {
          const sign = i % 2 === 0 ? 1 : -1;
          leg.rotation.x = Math.sin(elapsed * strideRate) * 0.45 * Math.min(1, speed / 10) * sign;
        });
        armParts.forEach((arm, i) => {
          const sign = i % 2 === 0 ? -1 : 1;
          arm.rotation.x = Math.sin(elapsed * strideRate) * 0.45 * Math.min(1, speed / 10) * sign;
        });

        // Altitude bounce
        mascotRoot.position.z = 16 + Math.abs(Math.sin(elapsed * strideRate)) * Math.min(1, speed / 10) * 3;

        if (radarBeam) radarBeam.visible = false;
        if (thinkingAura) thinkingAura.visible = false;
      } else {
        // Settle smoothly and precisely onto target
        vx *= 0.6;
        vy *= 0.6;
        mascotRoot.position.x = THREE.MathUtils.lerp(mascotRoot.position.x, target.x, 0.3);
        mascotRoot.position.y = THREE.MathUtils.lerp(mascotRoot.position.y, target.y, 0.3);

        // Smoothly stand upright and face forward toward user
        if (innerGroup) {
          innerGroup.rotation.y = THREE.MathUtils.lerp(innerGroup.rotation.y, 0, 0.18);
          innerGroup.rotation.x = THREE.MathUtils.lerp(innerGroup.rotation.x, 0, 0.18);
        }
        mascotRoot.rotation.z = THREE.MathUtils.lerp(mascotRoot.rotation.z, 0, 0.18);

        // Reset limbs
        legParts.forEach((leg) => {
          leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, 0, 0.25);
        });
        armParts.forEach((arm) => {
          arm.rotation.x = THREE.MathUtils.lerp(arm.rotation.x, 0, 0.25);
        });

        // ─── Micro-Action State Machine ──────────────────────────────────────
        if (nodTimer > 0) {
          // NOD MICRO-INTERACTION: Pitch forward down then rebound affirmatively
          nodTimer -= 0.02;
          const nodPhase = Math.sin((0.85 - nodTimer) * Math.PI * 3);
          headJoint.rotation.x = nodPhase * 0.35;
          headJoint.rotation.y = 0;
          if (statusLed) (statusLed.material as THREE.MeshBasicMaterial).color.setHex(0x10b981);
        } else if (nopeTimer > 0) {
          // NOPE MICRO-INTERACTION: Head drops slightly and performs horizontal left-right refusal shake
          nopeTimer -= 0.02;
          const shakePhase = Math.sin((0.95 - nopeTimer) * Math.PI * 5);
          headJoint.rotation.x = 0.1; // slight drop
          headJoint.rotation.y = shakePhase * 0.35; // horizontal negation shake
          if (statusLed) (statusLed.material as THREE.MeshBasicMaterial).color.setHex(0xef4444);
        } else if (curReaction === 'thinking') {
          // THINKING POSE: Head tilted up with glowing thought ring
          headJoint.rotation.x = -0.22;
          headJoint.rotation.y = 0.18;
          if (thinkingAura) {
            thinkingAura.visible = true;
            thinkingAura.rotation.z = elapsed * 3;
          }
          if (statusLed) (statusLed.material as THREE.MeshBasicMaterial).color.setHex(0x38bdf8);
        } else if (curReaction === 'scanning') {
          // RADAR SCAN: Project conical scan beam down onto node
          headJoint.rotation.x = 0.15;
          headJoint.rotation.y = 0.08;
          if (radarBeam) {
            radarBeam.visible = true;
            radarBeam.rotation.y = elapsed * 4;
            (radarBeam.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(elapsed * 8) * 0.15;
          }
          if (thinkingAura) thinkingAura.visible = false;
        } else {
          // Idle breathing hover
          headJoint.rotation.x = THREE.MathUtils.lerp(headJoint.rotation.x, 0, 0.1);
          headJoint.rotation.y = THREE.MathUtils.lerp(headJoint.rotation.y, 0, 0.1);
          mascotRoot.position.z = 16 + Math.sin(elapsed * 3) * 1.5;
          if (radarBeam) radarBeam.visible = false;
          if (thinkingAura) thinkingAura.visible = false;
        }
      }

      // Strict canvas boundary clamping (mascot can NEVER step off screen)
      const pad = 42;
      mascotRoot.position.x = Math.max(pad, Math.min(width - pad, mascotRoot.position.x));
      mascotRoot.position.y = Math.max(pad, Math.min(height - pad, mascotRoot.position.y));

      // Synchronize Shadow position under grounded feet
      shadowMesh.position.x = mascotRoot.position.x;
      shadowMesh.position.y = mascotRoot.position.y + 12;
      shadowMesh.scale.setScalar(0.9 + Math.sin(elapsed * 3) * 0.06);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, harness]);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 pointer-events-none z-30 overflow-hidden"
      style={{ width, height }}
    />
  );
}
