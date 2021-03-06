import mapboxgl from 'mapbox-gl';
import * as THREE from 'three';
import SPE from './spe/SPE';
import configs from './configs';
import * as helpers from './helpers';
import ThreeLayer from './three-layer';
import raindrop from './raindrop.png';

const modelOrigin = mapboxgl.MercatorCoordinate.fromLngLat(configs.originCoord),
    modelScale = modelOrigin.meterInMercatorCoordinateUnits();

const rainTexture = new THREE.TextureLoader().load(raindrop);

export default class extends ThreeLayer {

    constructor(id) {
        super(id);

        const me = this;

        me.emitterBounds = {};
        me.emitterQueue = [];
    }

    updateEmitterQueue(nowCastData) {
        const me = this,
            {map, emitterBounds} = me,
            bounds = map.getBounds(),
            ne = mapboxgl.MercatorCoordinate.fromLngLat(bounds.getNorthEast()),
            sw = mapboxgl.MercatorCoordinate.fromLngLat(bounds.getSouthWest()),
            resolution = helpers.clamp(Math.pow(2, Math.floor(17 - map.getZoom())), 0, 1) * 1088,
            currBounds = {
                left: Math.floor(helpers.clamp((sw.x - modelOrigin.x) / modelScale + 50000, 0, 108800) / resolution) * resolution,
                right: Math.ceil(helpers.clamp((ne.x - modelOrigin.x) / modelScale + 50000, 0, 108800) / resolution) * resolution,
                top: Math.floor(helpers.clamp((ne.y - modelOrigin.y) / modelScale + 42500 + 0, 0, 78336) / resolution) * resolution,
                bottom: Math.ceil(helpers.clamp((sw.y - modelOrigin.y) / modelScale + 42500 + 0, 0, 78336) / resolution) * resolution
            };

        if (nowCastData) {
            me.nowCastData = nowCastData;
        }

        if (nowCastData || currBounds.left !== emitterBounds.left ||
            currBounds.right !== emitterBounds.right ||
            currBounds.top !== emitterBounds.top ||
            currBounds.bottom !== emitterBounds.bottom) {
            me.bgGroup = new SPE.Group({
                texture: {
                    value: rainTexture
                },
                blending: THREE.NormalBlending,
                transparent: true,
                maxParticleCount: 500000
            });
            me.emitterQueue = [];
            for (let y = currBounds.top; y < currBounds.bottom; y += resolution) {
                for (let x = currBounds.left; x < currBounds.right; x += resolution) {
                    me.emitterQueue.push({
                        index: {
                            x: Math.floor(x / 1088),
                            y: Math.floor(y / 1088)
                        },
                        rect: {
                            x,
                            y,
                            w: resolution,
                            h: resolution
                        }
                    });
                }
            }
        }
        me.emitterBounds = currBounds;
    }

    refreshEmitter() {
        const me = this,
            {map, nowCastData, emitterQueue, fgGroup, bgGroup} = me;

        if (bgGroup) {
            const zoom = map.getZoom(),
                n = zoom >= 17 ? 20 : helpers.clamp(Math.floor(Math.pow(3, zoom - 13)), 3, 10000000),
                h = helpers.clamp(Math.pow(2, 14 - zoom), 0, 1) * 1000,
                v = helpers.clamp(Math.pow(1.7, 14 - zoom), 0, 1) * 2000,
                s = helpers.clamp(Math.pow(1.2, zoom - 14.5) * map.transform.cameraToCenterDistance / 800, 0, 1);
            let emitterCount = 30;

            while (emitterCount > 0) {
                const e = emitterQueue.shift();

                if (!e) {
                    me.imGroup = bgGroup;
                    delete me.bgGroup;
                    setTimeout(me.finalizeEmitterRefresh(), 500);
                    break;
                }
                if (!nowCastData || !nowCastData[e.index.y][e.index.x]) {
                    continue;
                }
                bgGroup.addEmitter(new SPE.Emitter({
                    maxAge: {
                        value: h / v
                    },
                    position: {
                        value: new THREE.Vector3((e.rect.x - 50000 + e.rect.w / 2) * modelScale, (42500 - e.rect.h / 2 - e.rect.y) * modelScale, h * modelScale),
                        spread: new THREE.Vector3(e.rect.w * modelScale, e.rect.h * modelScale, 0)
                    },
                    acceleration: {
                        value: new THREE.Vector3(0, 0, 0),
                        spread: new THREE.Vector3(v / 20 * modelScale, 0, 0)
                    },
                    velocity: {
                        value: new THREE.Vector3(0, 0, -v * modelScale),
                        spread: new THREE.Vector3(v / 200 * modelScale, v / 200 * modelScale)
                    },
                    color: {
                        value: new THREE.Color('blue')
                    },
                    size: {
                        value: 1e-6 / modelScale * s
                    },
                    particleCount: Math.pow(nowCastData[e.index.y][e.index.x], 2) * n
                }));
                emitterCount--;
            }
        }
        if (fgGroup) {
            fgGroup.tick();
        }
        if (me.imGroup) {
            me.imGroup.tick();
        }
    }

    finalizeEmitterRefresh() {
        const me = this,
            {scene, imGroup} = me;

        if (imGroup) {
            me.clear();
            me.fgGroup = imGroup;
            scene.add(imGroup.mesh);
        }
    }

    clear() {
        const me = this,
            {scene, fgGroup} = me;

        if (fgGroup) {
            scene.remove(fgGroup.mesh);
            // fgGroup.dispose();
        }
        delete me.imGroup;
    }

}
