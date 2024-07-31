document.addEventListener('DOMContentLoaded', (event) => {
    const canvas = document.getElementById('particle-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let particlesArray = [];
    let animationFrameId;
    let particleGenerationActive = false;

    function gridNoise(x, z, seed) {
        var n = (1619 * x + 31337 * z + 1013 * seed) & 0x7fffffff;
        n = BigInt((n >> 13) ^ n);
        n = n * (n * n * 60493n + 19990303n) + 1376312589n;
        n = parseInt(n.toString(2).slice(-31), 2);
        return 1 - n / 1073741824;
    }

    class Particle {
        constructor(color) {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = (gridNoise(this.x, this.y, 10) + 1);
            this.speed = this.size * 0.2;
            this.opacity = 0.5 + Math.random() * 0.5;
            this.color = color.replace(/[\d\.]+\)$/g, `${this.opacity})`);
        }

        update(particleGenerationActive) {
            // this.size += 0.1 + 0.1 * this.speed;
            // update size with acceleration (keep going faster)
            this.size += 0.05 + 0.01 * this.speed;
            this.speed = this.size + Math.random() * 0.2;
            if (this.size > 10 + Math.random()*10 && !particleGenerationActive) {
                this.size = 0;
            } else if (this.size > 10 + Math.random()*10) {
                this.size = (gridNoise(this.x, this.y, 10) + 1);
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
            }
        }

        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fill();
        }
    }

    function init() {
        particlesArray = [];
    }

    function animate(color, N) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (particlesArray.length < N && particleGenerationActive) {
            for (let i = 0; i < N * 0.01; i++) {
                particlesArray.push(new Particle(color));
            }
        }
        for (let i = 0; i < particlesArray.length; i++) {
            particlesArray[i].update(particleGenerationActive);
            particlesArray[i].draw();
            if (!particleGenerationActive && particlesArray[i].size < 0.1) {
                particlesArray.splice(i, 1);
                i--;
            }
        }
        if (particlesArray.length > 0 || particleGenerationActive) {
            animationFrameId = requestAnimationFrame(() => animate(color, N));
        } else {
            cancelAnimationFrame(animationFrameId);
        }
    }

    function startWinAnimation(color, duration) {
        init();
        particleGenerationActive = true;
        animate(color, 1000);
        setTimeout(() => {
            particleGenerationActive = false;
        }, duration * 1000);
    }

    window.startWinAnimation = startWinAnimation;

    window.addEventListener('resize', function() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        init();
    });
});