import fs from 'fs';
import path from 'path';


/*
 * =========================================================
 * 家庭群組狀態
 * =========================================================
 *
 * 這個模組只負責：
 *
 * 1. 保存家庭群組 ID
 * 2. 程式重新啟動後讀回群組 ID
 *
 * 不負責：
 *
 * - 排程
 * - 發訊息
 * - Observer
 * - Gemini
 */


/*
 * =========================================================
 * 狀態檔案位置
 * =========================================================
 *
 * 放在專案根目錄的 data/
 *
 * data/family-group.json
 */

const DATA_DIRECTORY =
  path.resolve(
    process.cwd(),
    'data',
  );


const STATE_FILE =
  path.join(
    DATA_DIRECTORY,
    'family-group.json',
  );


/*
 * =========================================================
 * 確保 data 資料夾存在
 * =========================================================
 */

function ensureDataDirectory(): void {

  if (
    !fs.existsSync(
      DATA_DIRECTORY,
    )
  ) {

    fs.mkdirSync(
      DATA_DIRECTORY,
      {
        recursive: true,
      },
    );
  }
}


/*
 * =========================================================
 * 保存家庭群組 ID
 * =========================================================
 */

export function saveFamilyGroupId(
  groupId: string,
): void {

  if (!groupId) {
    return;
  }


  try {

    ensureDataDirectory();


    const data = {
      groupId,
    };


    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify(
        data,
        null,
        2,
      ),
      'utf8',
    );


    console.log(
      '[Family Group State] 已保存家庭群組 ID',
    );

  } catch (error) {

    console.error(
      '[Family Group State] 保存家庭群組 ID 失敗:',
      error,
    );
  }
}


/*
 * =========================================================
 * 讀取家庭群組 ID
 * =========================================================
 */

export function loadFamilyGroupId():
  string | null {

  try {

    if (
      !fs.existsSync(
        STATE_FILE,
      )
    ) {

      return null;
    }


    const content =
      fs.readFileSync(
        STATE_FILE,
        'utf8',
      );


    const data =
      JSON.parse(
        content,
      );


    if (
      typeof data.groupId !== 'string' ||
      !data.groupId
    ) {

      return null;
    }


    console.log(
      '[Family Group State] 已讀取家庭群組 ID',
    );


    return data.groupId;

  } catch (error) {

    console.error(
      '[Family Group State] 讀取家庭群組 ID 失敗:',
      error,
    );


    return null;
  }
}