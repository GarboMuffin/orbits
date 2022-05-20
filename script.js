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

class Rectangle {
  constructor(left, top, right, bottom) {
    /** @type {number} x coordinate of top left corner */
    this.left = left;
    /** @type {number} y coordinate of top left corner */
    this.top = top;
    /** @type {number} x coordinate of bottom right corner */
    this.right = right;
    /** @type {number} y coordinate of bottom right corner */
    this.bottom = bottom;
  }

  get width() {
    return this.right - this.left;
  }

  get height() {
    return this.bottom - this.top;
  }

  /** @param {Rectangle} other */
  intersects(other) {
    return (
      this.left <= other.right &&
      other.left <= this.right &&
      this.top <= other.bottom &&
      other.top <= this.bottom
    );
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

    /** @type {Vector} Net force in Newtons */
    this.netForce = new Vector();

    /** @type {number} radius in meters */
    this.radius = 10;

    /** @type {color} color of the point */
    this.color = 'white';
  }

  setMass(mass) {
    this.mass = mass;
    return this;
  }

  setRadius(radius) {
    this.radius = radius;
    return this;
  }

  setPosition(x, y) {
    this.position.x = x;
    this.position.y = y;
    return this;
  }

  moveBy(x, y) {
    return this.setPosition(this.position.x + x, this.position.y + y);
  }

  setVelocity(x, y) {
    this.velocity.x = x;
    this.velocity.y = y;
    return this;
  }

  clone() {
    return new PointMass()
      .setMass(this.mass)
      .setRadius(this.radius)
      .setPosition(this.position.x, this.position.y)
      .setVelocity(this.velocity.x, this.velocity.y);
  }

  /** @param {number} timeStep Time step, in seconds */
  updateKinematics(timeStep) {
    // Repeated addition of many small time slices approximates an integral

    // Acceleration = Force / Mass
    const accelerationX = this.netForce.x / this.mass;
    const accelerationY = this.netForce.y / this.mass;

    // Integrate acceleration to find velocity
    this.velocity.x += accelerationX * timeStep;
    this.velocity.y += accelerationY * timeStep;

    // Integrate velocity to find position
    this.position.x += this.velocity.x * timeStep;
    this.position.y += this.velocity.y * timeStep;
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

  getBounds () {
    return new Rectangle(
      this.position.x - this.radius,
      this.position.y - this.radius,
      this.position.x + this.radius,
      this.position.y + this.radius
    );
  }
}

class Simulation {
  constructor() {
    /** @type {HTMLCanvasElement} */
    this.canvas = document.getElementById('canvas');
    /** @type {CanvasRenderingContext2D} */
    this.ctx = this.canvas.getContext('2d');

    this.updateRollover = 0;

    this.dirty = false;

    this.running = true;

    this.updatesPerSecond = 60;
    /** @param {number} In seconds */
    this.timeStep = 1 / this.updatesPerSecond;

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
        window.removeEventListener('mouseup', mouseup);
        window.removeEventListener('mousemove', mousemove);
      };
      const mousemove = (e) => {
        e.preventDefault();
        this.panBy(e.movementX, e.movementY);
      };
      window.addEventListener('mouseup', mouseup);
      window.addEventListener('mousemove', mousemove);
    });
    // document.addEventListener('mousemove', (e) => {
    //   console.log(this.getSimulationPointAtScreenPoint(e.clientX, e.clientY))
    // });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY, e.clientX, e.clientY);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    /** @type {PointMass[]} */
    this.objects = [];
  }

  updateCanvasSize() {
    this.baseWidth = this.canvas.offsetWidth;
    this.baseHeight = this.canvas.offsetHeight;
    this.rect = this.canvas.getBoundingClientRect();
    this.pixelRatio = window.devicePixelRatio;
    this.canvas.width = this.baseWidth * this.pixelRatio;
    this.canvas.height = this.baseHeight * this.pixelRatio;
    this.dirty = true;
  }

  panBy(screenMovementX, screenMovementY) {
    this.center.x -= screenMovementX / this.zoom;
    this.center.y -= screenMovementY / this.zoom;
    this.dirty = true;
  }

  zoomBy(deltaY, screenX, screenY) {
    // When we zoom, we want the point under the mouse cursor to remain the same.
    const point = this.getSimulationPointAtScreenPoint(screenX, screenY);
    const screenDistanceToLeftEdge = screenX - this.rect.left;
    const screenDistanceToTop = screenY - this.rect.top;

    const MIN_ZOOM = 0.000001;
    const ZOOM_SPEED = 0.01;
    const zoomAmount = -deltaY * ZOOM_SPEED;
    this.zoom = clamp(this.zoom * (2 ** zoomAmount), MIN_ZOOM, Infinity);

    const newViewport = this.getSimulationViewport();
    const newSimulationLeftEdge = point.x - (screenDistanceToLeftEdge / this.zoom);
    const newSimulationTop = point.y - (screenDistanceToTop / this.zoom);
    this.center.x = newSimulationLeftEdge + (newViewport.width / 2);
    this.center.y = newSimulationTop + (newViewport.height / 2);

    this.dirty = true;
  }

  getSimulationPointAtScreenPoint(clientX, clientY) {
    // These coordinates are all in "screen space"
    const canvasX = clientX - this.rect.left;
    const canvasY = clientY - this.rect.top;
    const fromCenterX = canvasX - (this.baseWidth / 2);
    const fromCenterY = canvasY - (this.baseHeight / 2);
    // Convert to "simulation space"
    return new Vector(
      this.center.x + (fromCenterX / this.zoom),
      this.center.y + (fromCenterY / this.zoom)
    );
  }

  getSimulationViewport() {
    const viewportWidth = this.baseWidth / this.zoom;
    const viewportHeight = this.baseHeight / this.zoom;
    const left = this.center.x - (viewportWidth / 2);
    const top = this.center.y - (viewportHeight / 2);
    return new Rectangle(
      left,
      top,
      left + viewportWidth,
      top + viewportHeight
    );
  }

  addObject(object) {
    if (this.objects.includes(object)) {
      throw new Error('Object already in simulation');
    }
    this.objects.push(object);
  }

  next(deltaTimeSeconds) {
    if (this.running) {
      // If we calculate that we have to run something like "7.5 steps", we'll carry the 0.5 over to the next
      // step so that if we get another "7.5 steps", we'll do 7 + 8 = 15 steps instead of 7 + 7 = 14 steps.
      const stepsToPerform = deltaTimeSeconds * this.updatesPerSecond + this.updateRollover;
      this.updateRollover = stepsToPerform % 1;
      for (let i = 0; i < Math.floor(stepsToPerform); i++) {
        this.updateObjects();
      }
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

  updateObjects() {
    if (this.objects.length === 0) {
      // Nothing to do.
      return;
    }

    // Forces are recalculated on every update.
    for (let i = 0; i < this.objects.length; i++) {
      const object = this.objects[i];
      object.netForce.x = 0;
      object.netForce.y = 0;
    }

    for (let i = 0; i < this.objects.length; i++) {
      const objectA = this.objects[i];
      for (let j = i + 1; j < this.objects.length; j++) {
        const objectB = this.objects[j];

        const distance = objectA.position.distanceTo(objectB.position);
        const dx = objectB.position.x - objectA.position.x;
        const dy = objectB.position.y - objectA.position.y;

        const nonCollidingDistance = objectA.radius + objectB.radius;
        const penetration = nonCollidingDistance - distance;
        if (penetration > 0) {
          // TODO: remove Math.atan2 etc.
          const angle = Math.atan2(-dy, -dx);

          // Spring force = stretch * spring constant
          const springConstant = 10000;
          const springMagnitude = springConstant * penetration;
          const springX = springMagnitude * Math.cos(angle);
          const springY = springMagnitude * Math.sin(angle);

          objectA.netForce.x += springX;
          objectA.netForce.y += springY;
          objectB.netForce.x -= springX;
          objectB.netForce.y -= springY;
        }

        // Universal gravitational field strength
        // Fg = G * m1 * m2 / r^2
        const gravityMagnitude = G * objectA.mass * objectB.mass / (distance ** 2);

        // We have two similar right triangles:
        // 1) Hypotenuse = distance between points, legs = displacement between points
        // 2) Hypotenuse = force, legs = components of force
        // These equations were found using proportions
        const gravityX = dx * gravityMagnitude / distance;
        const gravityY = dy * gravityMagnitude / distance;
        objectA.netForce.x += gravityX;
        objectA.netForce.y += gravityY;
        objectB.netForce.x -= gravityX;
        objectB.netForce.y -= gravityY;
      }

      // All forces involving object A have been calculated, so we can move it.
      objectA.updateKinematics(this.timeStep);
    }

    this.dirty = true;
  }

  render() {
    // Save power when not visible
    if (document.hidden) {
      return;
    }

    // Don't render if nothing changed
    if (!this.dirty) {
      return;
    }
    this.dirty = false;

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
    this.ctx.translate(-this.center.x, -this.center.y);

    const viewport = this.getSimulationViewport();

    for (const object of this.objects) {
      // Don't waste time trying to render objects that are completely offscreen
      if (!object.getBounds().intersects(viewport)) {
        continue;
      }

      this.ctx.save();

      this.ctx.translate(object.position.x, object.position.y);

      this.ctx.fillStyle = object.color;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, object.radius, 0, 2 * Math.PI);
      this.ctx.fill();

      // this.ctx.beginPath();
      // this.ctx.strokeStyle = 'blue';
      // this.ctx.lineWidth = object.radius / 3;
      // this.ctx.moveTo(0, 0);
      // this.ctx.lineTo(object.velocity.x * 1000, object.velocity.y * 1000);
      // this.ctx.stroke();

      // this.ctx.beginPath();
      // this.ctx.strokeStyle = 'red';
      // this.ctx.lineWidth = object.radius / 3;
      // this.ctx.moveTo(0, 0);
      // this.ctx.lineTo(object.netForce.x / object.mass * 2500000, object.netForce.y / object.mass * 2500000);
      // this.ctx.stroke();

      this.ctx.restore();
    }

    this.ctx.restore();
  }

  pause() {
    this.running = false;
  }

  resume() {
    this.running = true;
  }

  toggleRunning() {
    if (this.running) {
      this.pause();
    } else {
      this.resume();
    }
  }

  getSpeedRelativeToRealtime() {
    return this.updatesPerSecond * this.timeStep;
  }

  setExponentialSpeed(exponentialSpeed) {
    const speedRelativeToRealtime = 1.5 ** exponentialSpeed;
    if (speedRelativeToRealtime > 1000) {
      this.timeStep = 0.1;
    } else {
      this.timeStep = 0.02;
    }
    this.updatesPerSecond = speedRelativeToRealtime / this.timeStep;
  }

  startAnimationFrameLoop() {
    let focused = true;
    window.addEventListener('focus', () => {
      focused = true;
    });
    window.addEventListener('blur', () => {
      focused = false;
    });

    let previousTime = -1;
    const animationFrameCallback = (currentTime) => {
      requestAnimationFrame(animationFrameCallback);

      let deltaTimeMS = (previousTime === -1 || !focused) ? 0 : (currentTime - previousTime);
      previousTime = currentTime;
      deltaTimeMS = clamp(deltaTimeMS, 0, 30);
      const deltaTimeSeconds = deltaTimeMS / 1000;

      this.next(deltaTimeSeconds);
    };

    requestAnimationFrame(animationFrameCallback);
  }
}

const simulation = new Simulation();

const params = new URLSearchParams(location.search);

const earth = new PointMass()
  .setMass(5.972e24)
  .setRadius(6.371e6);
simulation.addObject(earth);

const moon = new PointMass()
  .setMass(7.34767309e22)
  .setRadius(1737400)
  .setPosition(0, earth.radius + 378000000)
  .setVelocity(1028.192, 0);
simulation.addObject(moon);

const iss = new PointMass()
  .setMass(444615000)
  .setRadius(70000)
  .setPosition(0, earth.radius + 413000)
  .setVelocity(7660, 0);
simulation.addObject(iss);

const projectile = new PointMass()
  .setMass(100)
  .setRadius(30000)
  .setPosition(0, -iss.position.y)
  .setVelocity(1000, 0);
simulation.addObject(projectile);

const testObject = new PointMass()
  .setMass(4446150000)
  .setRadius(700000)
  .setPosition(0, earth.radius + 20000000)
  .setVelocity(3500, 0);

simulation.addObject(testObject);
simulation.addObject(testObject.clone().moveBy(0, 2000000).setVelocity(0, -5000))

simulation.center.y = testObject.position.y;
simulation.zoom = 0.00009380341682666084;

simulation.render();
simulation.startAnimationFrameLoop();
