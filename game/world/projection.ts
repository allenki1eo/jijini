/**
 * Equirectangular projection around a city origin: +x east, +z south (meters).
 * Accurate to centimeters over a few kilometers, which is all a city needs.
 */
const EARTH_RADIUS = 6378137;
const DEG = Math.PI / 180;

export const makeProjector = (lat0: number, lon0: number) => {
  const kx = EARTH_RADIUS * DEG * Math.cos(lat0 * DEG);
  const kz = EARTH_RADIUS * DEG;
  return {
    project: (lat: number, lon: number): [number, number] => [(lon - lon0) * kx, -(lat - lat0) * kz],
    unproject: (x: number, z: number) => ({ lat: lat0 - z / kz, lon: lon0 + x / kx }),
  };
};
