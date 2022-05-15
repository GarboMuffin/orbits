// In seconds
const TIME_STEP = 1;
const TIME_STEPS_PER_SECOND = 10000;

// Gravitational constant
const G = 6.674e-11;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

class Vector {
  constructor(x=0, y=0) {
    this.x = x;
    this.y = y;
  }

  /**
   * @param {Vector} otherVector
   * @returns {number} distance in meters
   */
  distanceTo(otherVector) {
    return Math.sqrt((this.x - otherVector.x) ** 2 + (this.y - otherVector.y) ** 2);
  }

  magnitude() {
    return Math.sqrt(this.x ** 2 + this.y ** 2);
  }
}

class Energy {
  constructor () {
    /** @type {number} Kinetic energy in joules */
    this.kinetic = 0;

    /** @type {number} Gravitational potential energy in joules */
    this.gravitational = 0;
  }

  /** @returns {number} Total energy in joules */
  total() {
    return this.kinetic + this.gravitational;
  }
}

class PointMass {
  constructor () {
    /** @type {number} mass in kilograms */
    this.mass = 1;

    /** @type {Vector} position in meters */
    this.position = new Vector();

    /** @type {Vector} velocity in meters/second */
    this.velocity = new Vector();

    /** @type {Vector} acceleration in meters/second/second */
    this.acceleration = new Vector();

    /** @type {number} radius in meters */
    this.radius = 10;
  }

  static from(mass, radius, x, y, vx, vy) {
    const object = new PointMass();
    object.mass = mass;
    object.radius = radius;
    object.position.x = x;
    object.position.y = y;
    object.velocity.x = vx;
    object.velocity.y = vy;
    return object;
  }

  updateForces (simulation) {
    this.acceleration.x = 0;
    this.acceleration.y = 0;

    for (const object of simulation.objects) {
      if (object === this) continue;
      const distance = this.position.distanceTo(object.position);

      // Universal gravitational field strength
      // Fg = G * m1 * m2 / r^2
      const magnitude = G * this.mass * object.mass / (distance ** 2);

      // We have two similar right triangles:
      // 1) Hypotenuse = distance between points, legs = displacement between points
      // 2) Hypotenuse = force, legs = components of force
      // These equations were found using proportions
      const forceX = (object.position.x - this.position.x) * magnitude / distance;
      const forceY = (object.position.y - this.position.y) * magnitude / distance;

      // Acceleration = Force / Mass
      this.acceleration.x += forceX / this.mass;
      this.acceleration.y += forceY / this.mass;
    }
  }

  /** @param {Simulation} simulation */
  update (simulation) {
    // Repeated addition of many small time slices approximates an integral

    // Integrate acceleration to find velocity
    this.velocity.x += this.acceleration.x * TIME_STEP;
    this.velocity.y += this.acceleration.y * TIME_STEP;

    // Integrate position to find position
    this.position.x += this.velocity.x * TIME_STEP;
    this.position.y += this.velocity.y * TIME_STEP;
  }

  /** @param {Simulation} simulation */
  getEnergy (simulation) {
    const energy = new Energy();

    // Kt = 1/2 * m * v^2
    energy.kinetic = 0.5 * this.mass * this.velocity.magnitude() ** 2;

    for (const object of simulation.objects) {
      if (object === this) continue;
      const distance = this.position.distanceTo(object.position);
      // Ug = -G * m1 * m2 / r
      energy.gravitational += G * this.mass * object.mass / distance;
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
    this.zoom = 0.000006339726086728971;
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const mouseup = (e) => {
        e.preventDefault();
        cleanup();
      };
      const mousemove = (e) => {
        e.preventDefault();
        this.center.x += e.movementX / this.zoom;
        this.center.y += e.movementY / this.zoom;
      };
      const cleanup = () => {
        document.removeEventListener('mouseup', mouseup);
        document.removeEventListener('mousemove', mousemove);
      };
      document.addEventListener('mouseup', mouseup);
      document.addEventListener('mousemove', mousemove);
    });
    // document.addEventListener('mousemove', (e) => {
    //   console.log(this.getPointAtScreenPoint(e.clientX, e.clientY))
    // })
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      const deltaY = -e.deltaY * 0.01;
      let newZoom = this.zoom * (2 ** deltaY);
      const MIN_ZOOM = 0.000001;
      if (newZoom < MIN_ZOOM) {
        newZoom = MIN_ZOOM;
      }

      this.zoom = newZoom;
    });

    this.objects = [];
  }

  updateCanvasSize() {
    this.baseWidth = this.canvas.offsetWidth;
    this.baseHeight = this.canvas.offsetHeight;
    this.pixelRatio = window.devicePixelRatio;
    this.canvas.width = this.baseWidth * this.pixelRatio;
    this.canvas.height = this.baseHeight * this.pixelRatio;
    this.rect = this.canvas.getBoundingClientRect();
  }

  getPointAtScreenPoint(clientX, clientY) {
    // These coordinates are all in "screen space"
    const canvasX = clientX - this.rect.left;
    const canvasY = clientY - this.rect.top;
    const fromCenterX = canvasX - (this.rect.width / 2);
    const fromCenterY = canvasY - (this.rect.height / 2);
    // Convert to "simulation space"
    return new Vector(
      this.center.x + fromCenterX / this.zoom,
      this.center.y + fromCenterY / this.zoom
    );
  }

  addObject(object) {
    this.objects.push(object);
  }

  next(currentTime) {
    requestAnimationFrame(this.next);

    let deltaTimeMS = this.previousTime === -1 ? 0 : (currentTime - this.previousTime);
    this.previousTime = currentTime;
    deltaTimeMS = clamp(deltaTimeMS, 0, 100);
    const deltaTimeSeconds = deltaTimeMS / 1000;

    const stepsToPerform = deltaTimeSeconds * TIME_STEPS_PER_SECOND;
    for (let i = 0; i < stepsToPerform; i++) {
      this.update();
    }

    this.render();

    // const totalEnergy = new Energy();
    // let totalMomentum = 0;
    // for (const object of this.objects) {
    //   const objectEnergy = object.getEnergy(this);
    //   const objectMomentum = object.getMomentum();
    //   totalMomentum += objectMomentum;
    //   totalEnergy.kinetic += objectEnergy.kinetic;
    //   totalEnergy.gravitational += objectEnergy.gravitational;
    // }
    // console.log(totalEnergy.total(), totalMomentum);
  }

  update () {
    for (const object of this.objects) {
      object.updateForces(this);
    }
    for (const object of this.objects) {
      object.update(this);
    }
  }

  render () {
    // Save power when not visible
    if (document.hidden) {
      return;
    }

    this.ctx.save();

    // Upscale for high-DPI screens
    this.ctx.scale(this.pixelRatio, this.pixelRatio);

    // Redraw background over old frame
    this.ctx.fillStyle = 'black';
    this.ctx.fillRect(0, 0, this.baseWidth, this.baseHeight);

    // Move (0, 0) to the center of the canvas
    this.ctx.translate(this.baseWidth / 2, this.baseHeight / 2);

    // Apply user zoom
    this.ctx.scale(this.zoom, this.zoom);

    // Apply user pan
    this.ctx.translate(this.center.x, this.center.y);

    for (const object of this.objects) {
      object.render(this);
    }

    this.ctx.restore();
  }

  start() {
    requestAnimationFrame(this.next);
  }
}

const simulation = new Simulation();

const earth = PointMass.from(5.972e24, 6.371e6, 0, 0, 0, 0);
simulation.addObject(earth);

const moon = PointMass.from(7.34767309e22, 1737400, 0, earth.radius + 378000000, 1028.192, 0);
simulation.addObject(moon);

const iss = PointMass.from(444615000, 70000, 0, earth.radius + 413000, 7660, 0);
simulation.addObject(iss);

simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 20000000, 3500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 30000000, 2500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 40000000, 2500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 50000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 60000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 70000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 80000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 90000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 100000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 110000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 120000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 130000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 140000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 150000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 160000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 170000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 180000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 190000000, 1500, 0));
simulation.addObject(PointMass.from(4446150000, 700000, 0, earth.radius + 200000000, 1500, 0));

simulation.start();
