    window.addEventListener("error", (event) => {
      if (event.message) showError("The scene could not start. Check your connection and reload the page.");
    });
    window.addEventListener("unhandledrejection", () => {
      showError("The scene could not start. Check your connection and reload the page.");
    });
    function showError(message) {
      const notice = document.getElementById("error");
      if (notice) {
        notice.textContent = message;
        notice.hidden = false;
      }
    }

    try {
      const THREE = await import("three");
      const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
      const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
      const { UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js");

      const canvas = document.getElementById("scene");
      const mobile = window.matchMedia("(max-width: 700px)").matches;
      const particleCount = mobile ? 8200 : 16000;
      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: false,
        antialias: false,
        powerPreference: "high-performance"
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.7));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050106);
      scene.fog = new THREE.FogExp2(0x10030a, 0.018);

      const hazeCanvas = document.createElement("canvas");
      hazeCanvas.width = 256;
      hazeCanvas.height = 256;
      const hazeContext = hazeCanvas.getContext("2d");
      const hazeGradient = hazeContext.createRadialGradient(128, 128, 0, 128, 128, 128);
      hazeGradient.addColorStop(0, "rgba(150, 4, 42, 0.2)");
      hazeGradient.addColorStop(0.45, "rgba(84, 2, 28, 0.09)");
      hazeGradient.addColorStop(1, "rgba(26, 0, 12, 0)");
      hazeContext.fillStyle = hazeGradient;
      hazeContext.fillRect(0, 0, 256, 256);
      const hazeTexture = new THREE.CanvasTexture(hazeCanvas);
      const haze = new THREE.Sprite(new THREE.SpriteMaterial({
        map: hazeTexture,
        color: 0xff435e,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      }));
      haze.position.set(0, 1.1, -4.7);
      haze.scale.set(8.5, 7.2, 1);
      scene.add(haze);

      const camera = new THREE.PerspectiveCamera(37, window.innerWidth / window.innerHeight, 0.1, 70);
      camera.position.set(0, 1.5, mobile ? 8.1 : 7.55);
      camera.lookAt(0, 0.77, 0);

      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.34,
        0.72,
        0.18
      );
      composer.addPass(bloom);

      const heartRoot = new THREE.Group();
      heartRoot.position.y = 1.05;
      heartRoot.scale.setScalar(mobile ? 1.04 : 1.12);
      scene.add(heartRoot);

      const rand = (min, max) => min + Math.random() * (max - min);
      const smoothstep = (a, b, x) => {
        const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
      };

      function makeHeartOutline(steps = 360) {
        const outline = [];
        for (let i = 0; i < steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          const x = 16 * Math.pow(Math.sin(t), 3);
          const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          outline.push(new THREE.Vector2((x / 16) * 1.31, (y / 17) * 1.23 + 0.19));
        }
        return outline;
      }

      const outline = makeHeartOutline();

      function pointInHeart(x, y) {
        let inside = false;
        for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
          const a = outline[i];
          const b = outline[j];
          if ((a.y > y) !== (b.y > y) &&
              x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
        }
        return inside;
      }

      function distanceToHeartEdge(x, y) {
        let nearest = Infinity;
        for (let i = 0; i < outline.length; i++) {
          const a = outline[i];
          const b = outline[(i + 1) % outline.length];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const lengthSquared = dx * dx + dy * dy;
          const along = THREE.MathUtils.clamp(((x - a.x) * dx + (y - a.y) * dy) / lengthSquared, 0, 1);
          const ex = x - (a.x + along * dx);
          const ey = y - (a.y + along * dy);
          nearest = Math.min(nearest, ex * ex + ey * ey);
        }
        return Math.sqrt(nearest);
      }

      function heartThickness(x, y) {
        const edgeDistance = distanceToHeartEdge(x, y);
        return 0.79 * Math.min(1, Math.sqrt(edgeDistance / 0.35));
      }

      const heartPositions = new Float32Array(particleCount * 3);
      const startPositions = new Float32Array(particleCount * 3);
      const pointColors = new Float32Array(particleCount * 3);
      const pointSizes = new Float32Array(particleCount);
      const pointDelays = new Float32Array(particleCount);
      const pointSeeds = new Float32Array(particleCount);
      const palette = [
        new THREE.Color("#ff163d"),
        new THREE.Color("#ff3451"),
        new THREE.Color("#ff6570"),
        new THREE.Color("#d80a31"),
        new THREE.Color("#ff9a9f")
      ];
      const paletteWeights = [0.42, 0.26, 0.16, 0.1, 0.06];
      function pickHeartColor() {
        const roll = Math.random();
        let sum = 0;
        for (let i = 0; i < palette.length; i++) {
          sum += paletteWeights[i];
          if (roll < sum) return palette[i];
        }
        return palette[0];
      }

      for (let i = 0; i < particleCount; i++) {
        let x;
        let y;
        do {
          x = rand(-1.32, 1.32);
          y = rand(-1.04, 1.12);
        } while (!pointInHeart(x, y));
        const thickness = heartThickness(x, y);
        const z = rand(-thickness, thickness);
        const index = i * 3;
        heartPositions[index] = x;
        heartPositions[index + 1] = y;
        heartPositions[index + 2] = z;
        startPositions[index] = x + rand(-0.23, 0.23);
        startPositions[index + 1] = y - rand(3.4, 4.7);
        startPositions[index + 2] = z + rand(-0.28, 0.28);
        const color = pickHeartColor();
        const glow = rand(0.72, 1.55);
        pointColors[index] = color.r * glow * 1.2;
        pointColors[index + 1] = color.g * glow * 1.2;
        pointColors[index + 2] = color.b * glow * 1.2;
        pointSizes[i] = rand(0.018, 0.048) * (Math.random() < 0.045 ? 1.45 : 1);
        pointDelays[i] = THREE.MathUtils.clamp((y + 1.1) / 2.28, 0, 1) * 0.66 + rand(0, 0.13);
        pointSeeds[i] = Math.random() * Math.PI * 2;
      }

      const heartGeometry = new THREE.BufferGeometry();
      heartGeometry.setAttribute("position", new THREE.BufferAttribute(heartPositions, 3));
      heartGeometry.setAttribute("aStart", new THREE.BufferAttribute(startPositions, 3));
      heartGeometry.setAttribute("aColor", new THREE.BufferAttribute(pointColors, 3));
      heartGeometry.setAttribute("aSize", new THREE.BufferAttribute(pointSizes, 1));
      heartGeometry.setAttribute("aDelay", new THREE.BufferAttribute(pointDelays, 1));
      heartGeometry.setAttribute("aSeed", new THREE.BufferAttribute(pointSeeds, 1));

      const heartMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uReveal: { value: 0 },
          uPixelRatio: { value: renderer.getPixelRatio() }
        },
        vertexShader: `
          attribute vec3 aStart;
          attribute vec3 aColor;
          attribute float aSize;
          attribute float aDelay;
          attribute float aSeed;
          uniform float uTime;
          uniform float uReveal;
          uniform float uPixelRatio;
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vec3 destination = position;
            float formed = smoothstep(aDelay, aDelay + 0.21, uReveal);
            vec3 p = mix(aStart, destination, formed);
            float drift = (1.0 - formed);
            p.x += sin(uTime * 1.25 + aSeed) * 0.17 * drift;
            p.z += cos(uTime * 1.05 + aSeed * 1.7) * 0.2 * drift;
            vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * viewPosition;
            gl_PointSize = aSize * uPixelRatio * (430.0 / -viewPosition.z);
            vColor = aColor;
            vAlpha = 0.28 + 0.72 * formed;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          varying float vAlpha;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float r = length(p);
            if (r > 0.5) discard;
            float core = exp(-r * 13.0);
            float halo = exp(-r * 6.0) * 0.48;
            float alpha = (core + halo) * vAlpha;
            gl_FragColor = vec4(vColor * (0.95 + core * 1.5), alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const heartPoints = new THREE.Points(heartGeometry, heartMaterial);
      heartPoints.frustumCulled = false;
      heartRoot.add(heartPoints);

      function buildWordCloud() {
        const wordCanvas = document.createElement("canvas");
        wordCanvas.width = 256;
        wordCanvas.height = 64;
        const context = wordCanvas.getContext("2d", { willReadFrequently: true });
        context.clearRect(0, 0, wordCanvas.width, wordCanvas.height);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = '600 40px Georgia, "Times New Roman", serif';
        context.fillStyle = "#fff";
        context.fillText("I LOVE YOU", wordCanvas.width / 2, wordCanvas.height / 2 + 1, 250);
        const pixels = context.getImageData(0, 0, wordCanvas.width, wordCanvas.height).data;
        const glyph = [];
        for (let y = 7; y < 58; y += 2) {
          for (let x = 3; x < 253; x += 2) {
            if (pixels[(y * wordCanvas.width + x) * 4 + 3] > 96) {
              glyph.push([(x / wordCanvas.width - 0.5) * 0.36, (0.5 - y / wordCanvas.height) * 0.09]);
            }
          }
        }

        const anchors = [];
        for (let row = 0, y = -0.94; y <= 1.02; row++, y += 0.145) {
          const offset = row % 2 === 0 ? 0 : 0.19;
          for (let x = -1.32 + offset; x <= 1.32; x += 0.38) {
            const fits = [
              [-0.16, -0.03], [-0.16, 0.03], [0, -0.03],
              [0, 0.03], [0.16, -0.03], [0.16, 0.03]
            ].every(([dx, dy]) => pointInHeart(x + dx, y + dy));
            if (fits) anchors.push({ x, y });
          }
        }

        const count = anchors.length * 2 * glyph.length;
        const positions = new Float32Array(count * 3);
        const starts = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const delays = new Float32Array(count);
        const seeds = new Float32Array(count);
        const textPalette = [
          new THREE.Color("#ff2445"),
          new THREE.Color("#ff405b"),
          new THREE.Color("#ff7081")
        ];
        let index = 0;
        for (const anchor of anchors) {
          for (let face = 0; face < 2; face++) {
            const back = face === 1;
            const center = new THREE.Vector3(
              anchor.x,
              anchor.y,
              heartThickness(anchor.x, anchor.y) * (back ? -1 : 1) + (back ? -0.014 : 0.014)
            );
            const orientation = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(rand(-0.025, 0.025), back ? Math.PI : 0, rand(-0.04, 0.04))
            );
            const color = textPalette[Math.floor(Math.random() * textPalette.length)];
            const delay = THREE.MathUtils.clamp((anchor.y + 1.1) / 2.28, 0, 1) * 0.66;
            for (const [glyphX, glyphY] of glyph) {
              const index3 = index * 3;
              const target = new THREE.Vector3(back ? -glyphX : glyphX, glyphY, rand(-0.003, 0.003))
                .applyQuaternion(orientation)
                .add(center);
              positions[index3] = target.x;
              positions[index3 + 1] = target.y;
              positions[index3 + 2] = target.z;
              starts[index3] = target.x + rand(-0.045, 0.045);
              starts[index3 + 1] = target.y - rand(3.4, 4.7);
              starts[index3 + 2] = target.z + rand(-0.12, 0.12);
              const brightness = rand(0.68, 1.25);
              colors[index3] = color.r * brightness;
              colors[index3 + 1] = color.g * brightness;
              colors[index3 + 2] = color.b * brightness;
              sizes[index] = rand(0.008, 0.014);
              delays[index] = delay + rand(0, 0.045);
              seeds[index] = Math.random() * Math.PI * 2;
              index++;
            }
          }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("aStart", new THREE.BufferAttribute(starts, 3));
        geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute("aDelay", new THREE.BufferAttribute(delays, 1));
        geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
        const material = heartMaterial.clone();
        material.depthWrite = true;
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        heartRoot.add(points);
        return material;
      }

      const wordMaterial = buildWordCloud();

      const floor = new THREE.Group();
      floor.position.y = -0.49;
      scene.add(floor);
      const floorDisc = new THREE.Mesh(
        new THREE.CircleGeometry(2.65, 96),
        new THREE.MeshBasicMaterial({ color: 0x10030b, transparent: true, opacity: 0.66, side: THREE.DoubleSide })
      );
      floorDisc.rotation.x = -Math.PI / 2;
      floor.add(floorDisc);

      const platformRings = [
        { radius: 1.57, color: 0x7e1028, opacity: 0.33, tube: 0.012 },
        { radius: 1.92, color: 0xe51b3e, opacity: 0.68, tube: 0.014 },
        { radius: 2.32, color: 0x81102e, opacity: 0.3, tube: 0.009 },
        { radius: 2.78, color: 0x501024, opacity: 0.2, tube: 0.008 }
      ];
      platformRings.forEach((ring) => {
        const mesh = new THREE.Mesh(
          new THREE.TorusGeometry(ring.radius, ring.tube, 8, 180),
          new THREE.MeshBasicMaterial({
            color: ring.color,
            transparent: true,
            opacity: ring.opacity,
            depthWrite: false,
            blending: THREE.AdditiveBlending
          })
        );
        mesh.rotation.x = Math.PI / 2;
        floor.add(mesh);
      });

      function buildAtmosphere() {
        const count = mobile ? 680 : 1250;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const seeds = new Float32Array(count);
        const speeds = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          const index = i * 3;
          positions[index] = rand(-8.8, 8.8);
          positions[index + 1] = rand(-3.7, 7.6);
          positions[index + 2] = rand(-7.5, -1.6);
          const color = Math.random() < 0.73 ? new THREE.Color("#9e1738") : new THREE.Color("#f04a61");
          colors.set([color.r * rand(0.35, 1), color.g * rand(0.35, 1), color.b * rand(0.35, 1)], index);
          sizes[i] = rand(0.008, 0.026);
          seeds[i] = Math.random() * Math.PI * 2;
          speeds[i] = rand(0.07, 0.31);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
        geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
        const material = new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
          vertexShader: `
            attribute vec3 aColor;
            attribute float aSize;
            attribute float aSeed;
            attribute float aSpeed;
            uniform float uTime;
            uniform float uPixelRatio;
            varying vec3 vColor;
            varying float vTwinkle;
            void main() {
              vec3 p = position;
              p.y = mod(p.y + uTime * aSpeed + 4.0, 11.3) - 4.0;
              p.x += sin(uTime * 0.17 + aSeed) * 0.12;
              vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
              gl_Position = projectionMatrix * viewPosition;
              gl_PointSize = aSize * uPixelRatio * (430.0 / -viewPosition.z);
              vColor = aColor;
              vTwinkle = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * 1.7 + aSeed));
            }
          `,
          fragmentShader: `
            varying vec3 vColor;
            varying float vTwinkle;
            void main() {
              float r = length(gl_PointCoord - 0.5);
              if (r > 0.5) discard;
              float glow = exp(-r * 8.5);
              gl_FragColor = vec4(vColor * (0.5 + glow), glow * vTwinkle * 0.8);
            }
          `,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        const points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        scene.add(points);
        return material;
      }

      const atmosphereMaterial = buildAtmosphere();
      const clock = new THREE.Clock();
      const formationDuration = 4.4;
      let animationFrame;

      function animate() {
        animationFrame = window.requestAnimationFrame(animate);
        const elapsed = clock.getElapsedTime();
        const formation = THREE.MathUtils.clamp((elapsed - 0.3) / formationDuration, 0, 1);
        heartMaterial.uniforms.uTime.value = elapsed;
        heartMaterial.uniforms.uReveal.value = formation;
        wordMaterial.uniforms.uTime.value = elapsed;
        wordMaterial.uniforms.uReveal.value = formation;

        heartRoot.rotation.y = Math.sin(elapsed * 0.7) * 0.4;
        heartRoot.rotation.x = Math.sin(elapsed * 0.22) * 0.075;
        heartRoot.rotation.z = Math.sin(elapsed * 0.17) * 0.025;
        const heartbeat = 1 + 0.018 * Math.pow((0.5 + 0.5 * Math.sin(elapsed * 2.25 - 0.6)), 8);
        heartRoot.scale.setScalar((mobile ? 1.04 : 1.12) * heartbeat);
        atmosphereMaterial.uniforms.uTime.value = elapsed;
        composer.render();
      }

      function resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const isNarrow = width < 700;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isNarrow ? 1.35 : 1.7));
        renderer.setSize(width, height, false);
        composer.setSize(width, height);
        camera.aspect = width / height;
        camera.fov = isNarrow ? 37 : 35;
        camera.position.z = isNarrow ? 8.1 : 7.55;
        camera.lookAt(0, 0.77, 0);
        camera.updateProjectionMatrix();
        const ratio = renderer.getPixelRatio();
        heartMaterial.uniforms.uPixelRatio.value = ratio;
        atmosphereMaterial.uniforms.uPixelRatio.value = ratio;
      }

      window.addEventListener("resize", resize, { passive: true });
      window.addEventListener("pagehide", () => window.cancelAnimationFrame(animationFrame), { once: true });
      resize();
      animate();
    } catch (error) {
      console.error("Unable to initialize the Three.js love scene:", error);
      showError("The scene could not start. Check your connection and reload the page.");
    }
