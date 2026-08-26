/**
 * =========================================================
 * Style State
 * =========================================================
 *
 * 負責管理目前啟用的 Style。
 *
 * State 獨立儲存在：
 *
 * data/style-state.json
 *
 * 因此：
 *
 * - 程式重新啟動
 * - 開發過程多次重啟
 * - 未來重新部署
 *
 * 只要 State 檔案仍然存在，
 * 就可以保留目前啟用的 Style。
 *
 * =========================================================
 */


import fs from 'fs';

import path from 'path';


import {
  getStyleById,
  isEnabledStyle,
} from './styles/style-registry';


/**
 * =========================================================
 * Style State 結構
 * =========================================================
 */

export interface StyleState {

  activeStyleId: string;

}


/**
 * =========================================================
 * 預設 Style State
 * =========================================================
 */

const DEFAULT_STYLE_STATE:
  StyleState = {

  activeStyleId:
    'palace',

};


/**
 * =========================================================
 * State 檔案路徑
 * =========================================================
 */

const STYLE_STATE_FILE_PATH =
  path.resolve(
    process.cwd(),
    'data',
    'style-state.json',
  );


/**
 * =========================================================
 * 讀取目前 Style State
 * =========================================================
 */

export function getStyleState():
  StyleState {

  try {

    if (
      !fs.existsSync(
        STYLE_STATE_FILE_PATH,
      )
    ) {

      return {
        ...DEFAULT_STYLE_STATE,
      };

    }


    const raw =
      fs.readFileSync(
        STYLE_STATE_FILE_PATH,
        'utf8',
      );


    const parsed =
      JSON.parse(
        raw,
      ) as Partial<StyleState>;


    const activeStyleId =
      typeof parsed.activeStyleId === 'string'
        ? parsed.activeStyleId
        : DEFAULT_STYLE_STATE.activeStyleId;


    if (
      !isEnabledStyle(
        activeStyleId,
      )
    ) {

      return {
        ...DEFAULT_STYLE_STATE,
      };

    }


    return {

      activeStyleId,

    };

  } catch {

    return {
      ...DEFAULT_STYLE_STATE,
    };

  }

}


/**
 * =========================================================
 * 儲存 Style State
 * =========================================================
 */

function saveStyleState(
  state: StyleState,
): void {

  const directory =
    path.dirname(
      STYLE_STATE_FILE_PATH,
    );


  if (
    !fs.existsSync(
      directory,
    )
  ) {

    fs.mkdirSync(
      directory,
      {
        recursive: true,
      },
    );

  }


  fs.writeFileSync(
    STYLE_STATE_FILE_PATH,
    JSON.stringify(
      state,
      null,
      2,
    ),
    'utf8',
  );

}


/**
 * =========================================================
 * 取得目前啟用的 Style ID
 * =========================================================
 */

export function getActiveStyleId():
  string {

  return getStyleState()
    .activeStyleId;

}


/**
 * =========================================================
 * 取得目前啟用的 Style
 * =========================================================
 */

export function getActiveStyle() {

  const styleId =
    getActiveStyleId();


  const style =
    getStyleById(
      styleId,
    );


  if (!style) {

    return getStyleById(
      DEFAULT_STYLE_STATE.activeStyleId,
    )!;

  }


  return style;

}


/**
 * =========================================================
 * 切換目前啟用的 Style
 * =========================================================
 *
 * 只有：
 *
 * - 存在
 * - 已啟用
 *
 * 的 Style 才能切換。
 * =========================================================
 */

export function setActiveStyle(
  styleId: string,
): boolean {

  if (
    !isEnabledStyle(
      styleId,
    )
  ) {

    return false;

  }


  saveStyleState({

    activeStyleId:
      styleId,

  });


  return true;

}


/**
 * =========================================================
 * 確保 State 檔案存在
 * =========================================================
 *
 * 如果目前沒有 State 檔案，
 * 第一次啟動時建立預設 State。
 * =========================================================
 */

export function ensureStyleState():
  void {

  if (
    fs.existsSync(
      STYLE_STATE_FILE_PATH,
    )
  ) {

    return;

  }


  saveStyleState(
    DEFAULT_STYLE_STATE,
  );

}