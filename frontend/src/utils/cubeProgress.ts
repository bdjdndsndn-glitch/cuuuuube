/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Розрахунок відсотка зібраності кубика Рубіка в реальному часі.
 * Використовує матрицю відповідності 6 граней та 6 цільових кольорів,
 * знаходячи глобальний математичний оптимум (720 перевірок).
 */

export interface CubeProgressResult {
  percent: number;
  matchedStickers: number;
  totalStickers: number;
  solvedFaces: number;
  isSolved: boolean;
  cubeSize: number;
}

const COLORS = ['L', 'R', 'D', 'U', 'B', 'F'];
const FACES = ['x-', 'x+', 'y-', 'y+', 'z-', 'z+'];

// Попередньо згенеровані 720 перестановок для миттєвого пошуку оптимального зіставлення
const PERMUTATIONS: number[][] = (() => {
  function getPermutations(arr: number[]): number[][] {
    if (arr.length <= 1) return [arr];
    const res: number[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const cur = arr[i];
      const rem = arr.slice(0, i).concat(arr.slice(i + 1));
      const sub = getPermutations(rem);
      for (const s of sub) res.push([cur, ...s]);
    }
    return res;
  }
  return getPermutations([0, 1, 2, 3, 4, 5]);
})();

/**
 * Знаходить максимальну кількість наліпок, які відповідають кожній грані
 */
function computeOptimalMatching(facesData: Record<string, string[]>): number {
  const counts = new Int32Array(36); // 6x6 матриця: [face * 6 + colorIdx]

  for (let f = 0; f < 6; f++) {
    const list = facesData[FACES[f]];
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const cIdx = COLORS.indexOf(list[i]);
      if (cIdx >= 0) {
        counts[f * 6 + cIdx]++;
      }
    }
  }

  let maxMatched = 0;
  for (let p = 0; p < PERMUTATIONS.length; p++) {
    const perm = PERMUTATIONS[p];
    const matched =
      counts[perm[0]] +
      counts[6 + perm[1]] +
      counts[12 + perm[2]] +
      counts[18 + perm[3]] +
      counts[24 + perm[4]] +
      counts[30 + perm[5]];

    if (matched > maxMatched) {
      maxMatched = matched;
    }
  }

  return maxMatched;
}

/**
 * Отримати точний прогрес зібраності кубика у відсотках (0–100%)
 */
export function getCubeProgress(): CubeProgressResult {
  const defaultResult: CubeProgressResult = {
    percent: 100,
    matchedStickers: 54,
    totalStickers: 54,
    solvedFaces: 6,
    isSolved: true,
    cubeSize: 3,
  };

  if (typeof window === 'undefined') return defaultResult;

  const game = (window as any).game;
  if (!game || !game.cube || !game.cube.edges || !game.controls) {
    return defaultResult;
  }

  const cubeObj = game.cube.object;
  const edges = game.cube.edges;
  const getMainAxis = game.controls.getMainAxis?.bind(game.controls);

  if (!cubeObj || !edges || !edges.length || !getMainAxis) {
    return defaultResult;
  }

  const totalStickers = edges.length;
  const stickersPerFace = totalStickers / 6;
  const cubeSize = game.cube.size || 3;

  const facesData: Record<string, string[]> = {
    'x-': [],
    'x+': [],
    'y-': [],
    'y+': [],
    'z-': [],
    'z+': [],
  };

  try {
    // Оновлюємо світову матрицю перед зчитуванням для точності координат
    if (cubeObj.updateMatrixWorld) {
      cubeObj.updateMatrixWorld(true);
    }

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (!e || !e.parent) continue;

      const a = e.parent.localToWorld(e.position.clone()).sub(cubeObj.position);
      const axis = getMainAxis(a);
      const sign = 1 > a.multiplyScalar(2).round()[axis] ? '-' : '+';
      const faceKey = axis + sign;

      if (facesData[faceKey]) {
        facesData[faceKey].push(e.name);
      }
    }
  } catch {
    return defaultResult;
  }

  // Перевірка кількості повністю зібраних граней (де всі наліпки однакового кольору)
  let solvedFaces = 0;
  for (let f = 0; f < 6; f++) {
    const list = facesData[FACES[f]];
    if (list && list.length === stickersPerFace && list.every((val) => val === list[0])) {
      solvedFaces++;
    }
  }

  const maxMatched = computeOptimalMatching(facesData);
  const isSolved = maxMatched === totalStickers;
  const rawPercent = totalStickers > 0 ? (maxMatched / totalStickers) * 100 : 0;
  const percent = isSolved ? 100 : Math.min(99, Math.round(rawPercent));

  return {
    percent,
    matchedStickers: maxMatched,
    totalStickers,
    solvedFaces,
    isSolved,
    cubeSize,
  };
}
