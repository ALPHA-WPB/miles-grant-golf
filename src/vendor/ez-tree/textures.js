// Oak bark and leaf textures only (trimmed from ez-tree; see LICENSE)
import * as THREE from 'three';
import oakAo from './assets/bark/oak_ao_1k.jpg';
import oakColor from './assets/bark/oak_color_1k.jpg';
import oakNormal from './assets/bark/oak_normal_1k.jpg';
import oakRoughness from './assets/bark/oak_roughness_1k.jpg';
import oakLeaves from './assets/leaves/oak_color.png';

const textureLoader = new THREE.TextureLoader();
const load = (url, srgb = true) => {
  const t = textureLoader.load(url);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const oak = { ao: load(oakAo, false), color: load(oakColor), normal: load(oakNormal, false), roughness: load(oakRoughness, false) };
const textures = { bark: { oak, birch: oak, pine: oak, willow: oak }, leaves: { oak: load(oakLeaves), ash: null, aspen: null, pine: null } };

export function getBarkTexture(barkType, fileType, scale = { x: 1, y: 1 }) {
  const texture = (textures.bark[barkType] || oak)[fileType];
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.x = scale.x;
  texture.repeat.y = 1 / scale.y;
  return texture;
}

export function getLeafTexture(leafType) {
  return textures.leaves[leafType] || textures.leaves.oak;
}
