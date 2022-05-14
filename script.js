// Seconds of real physics per millisecond of simulated physics
const TIME_STEP = 0.01;
const TIME_STEPS_PER_UPDATE = 10000;

const G = 6.674e-11;

class Vector {
  constructor() {
    this.x = 0;
    this.y = 0;
  }

  /**
   * @param {number} magnitude 
   * @param {number} angle angle in radians
   * @returns {Vector}
   */
  static fromAngle(magnitude, angle) {
    const vector = new Vector();
    vector.x = magnitude * Math.cos(angle);
    vector.y = magnitude * Math.sin(angle);
    return vector;
  }

  /** @param {Vector} otherVector */
  distanceTo(otherVector) {
    return Math.sqrt((this.x - otherVector.x) ** 2 + (this.y - otherVector.y) ** 2);
  }

  /**
   * @param {Vector} otherVector
   * @returns {number} angle in radians
   */
  angleTo(otherVector) {
    return Math.atan2(otherVector.x - this.x, otherVector.y - this.y);
  }

  magnitude() {
    return Math.sqrt(this.x ** 2 + this.y ** 2);
  }

  addInPlace(otherVector) {
    this.x += otherVector.x;
    this.y += otherVector.y;
  }

  scalarDivideInPlace(k) {
    this.x /= k;
    this.y /= k;
  }
}

class Energy {
  constructor () {
    /** @type {number} Kinetic energy in joules */
    this.kinetic = 0;

    /** @type {number} Gravitational potential energy in joules */
    this.gravitational = 0;
  }
}

class PointMass {
  constructor () {
    /** @type {number} mass in kilograms */
    this.mass = 0;

    /** @type {Vector} position in meters */
    this.position = new Vector();

    /** @type {Vector} velocity in meters/second */
    this.velocity = new Vector();

    /** @type {Vector} acceleration in meters/second/second */
    this.acceleration = new Vector();

    /** @type {number} radius in meters */
    this.radius = 10;
  }

  updateForces (simulation) {
    this.acceleration.x = 0;
    this.acceleration.y = 0;

    for (const object of simulation.objects) {
      if (object === this) continue;
      const distance = this.position.distanceTo(object.position);

      // Universal gravitation
      // Fg = G * m1 * m2 / r^2
      const magnitude = G * this.mass * object.mass / (distance ** 2);

      const forceX = (object.position.x - this.position.x) * magnitude / distance;
      const forceY = (object.position.y - this.position.y) * magnitude / distance;

      // Force = Mass * Acceleration
      this.acceleration.x += forceX / this.mass;
      this.acceleration.y += forceY / this.mass;
    }
  }

  /** @param {Simulation} simulation */
  update (simulation) {
    this.velocity.x += this.acceleration.x * simulation.deltaTime;
    this.velocity.y += this.acceleration.y * simulation.deltaTime;

    this.position.x += this.velocity.x * simulation.deltaTime;
    this.position.y += this.velocity.y * simulation.deltaTime;
  }

  /** @param {Simulation} simulation */
  getEnergy (simulation) {
    const energy = new Energy();

    // Kt = 1/2 * m * v^2
    energy.kinetic = 0.5 * this.mass * this.velocity.magnitude() ** 2;

    for (const object of simulation.objects) {
      if (object === this) continue;
      const distance = this.position.distanceTo(object.position);
      // Ug = m * g * h
      energy.gravitational += G * this.mass * object.mass / (distance ** 2);
    }

    return energy;
  }

  getMomentum () {
    // p = m * v
    return this.mass * this.velocity.magnitude();
  }

  /** @param {Simulation} simulation */
  render (simulation) {
    simulation.ctx.save();

    simulation.ctx.translate(this.position.x, this.position.y);
    simulation.ctx.fillStyle = 'white';
    simulation.ctx.beginPath();
    simulation.ctx.arc(0, 0, this.radius, 0, 2 * Math.PI);
    simulation.ctx.fill();

    simulation.ctx.restore();
  }
}

class Simulation {
  constructor() {
    /** @type {HTMLCanvasElement} */
    this.canvas = document.getElementById('canvas');
    /** @type {CanvasRenderingContext2D} */
    this.ctx = this.canvas.getContext('2d');

    this.next = this.next.bind(this);
    this.previousTime = -1;

    window.addEventListener('resize', () => {
      this.updateCanvasSize();
    });
    this.updateCanvasSize();

    this.center = new Vector();
    this.zoom = 1;
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const mouseup = (e) => {
        e.preventDefault();
        cleanup();
      };
      const mousemove = (e) => {
        e.preventDefault();
        this.center.x += e.movementX;
        this.center.y += e.movementY;
      };
      const cleanup = () => {
        document.removeEventListener('mouseup', mouseup);
        document.removeEventListener('mousemove', mousemove);
      };
      document.addEventListener('mouseup', mouseup);
      document.addEventListener('mousemove', mousemove);
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom += -e.deltaY * 0.001;
      const MIN_ZOOM = 0.000001;
      if (this.zoom < MIN_ZOOM) {
        this.zoom = MIN_ZOOM;
      }
    });

    this.objects = [];
    this.deltaTime = 0;
  }

  updateCanvasSize() {
    this.baseWidth = this.canvas.offsetWidth;
    this.baseHeight = this.canvas.offsetHeight;
    this.pixelRatio = window.devicePixelRatio;
    this.canvas.width = this.baseWidth * this.pixelRatio;
    this.canvas.height = this.baseHeight * this.pixelRatio;
  }

  addObject(object) {
    this.objects.push(object);
  }

  next(currentTime) {
    requestAnimationFrame(this.next);

    // this.deltaTime = (this.previousTime === -1 ? 0 : (currentTime - this.previousTime)) * TIME_STEP;
    // this.previousTime = currentTime;
    this.deltaTime = 16 * TIME_STEP;

    for (let i = 0; i < TIME_STEPS_PER_UPDATE; i++) {
      for (const object of this.objects) {
        object.updateForces(this);
      }
      for (const object of this.objects) {
        object.update(this);
      }
    }

    this.ctx.save();

    // Handle high-DPI screens
    this.ctx.scale(this.pixelRatio, this.pixelRatio);

    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.baseWidth, this.baseHeight);

    // Move (0, 0) to the center of the canvas
    this.ctx.translate(this.baseWidth / 2, this.baseHeight / 2);

    // Move the center of the canvas to the user's center
    this.ctx.translate(this.center.x, this.center.y);

    this.ctx.scale(this.zoom, this.zoom);

    for (const object of this.objects) {
      object.render(this);
    }

    // this.ctx.fillStyle = 'white';
    // this.ctx.font = '30px sans-serif';
    // this.ctx.fillText("Trolled!", 100, 100);

    const totalEnergy = new Energy();
    for (const object of this.objects) {
      const energy = object.getEnergy(this);
      totalEnergy.kinetic += energy.kinetic;
      totalEnergy.gravitational += energy.gravitational;
    }
    console.log(totalEnergy.kinetic + totalEnergy.gravitational);

    this.ctx.restore();
  }

  start() {
    requestAnimationFrame(this.next);
  }
}

const simulation = new Simulation();

const earth = new PointMass();
earth.mass = 5.972e24;
earth.radius = 6.371e6;
earth.position.x = 0;
earth.position.y = 0;
simulation.addObject(earth);

const moon = new PointMass();
moon.mass = 7.34767309e22;
moon.radius = 1737400;
moon.velocity.x = 1028.192;
moon.position.x = 0;
moon.position.y = earth.radius + 378000000;
simulation.addObject(moon);

simulation.start();
