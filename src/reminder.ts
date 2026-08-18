import fs from 'fs';
import path from 'path';


/*
 * =========================================================
 * Reminder
 * =========================================================
 *
 * 這個模組只負責：
 *
 * 1. Reminder 資料結構
 * 2. Reminder 保存
 * 3. Reminder 讀取
 * 4. Reminder 完成狀態
 *
 * 不負責：
 *
 * - Gemini
 * - 自然語言解析
 * - Scheduler
 * - LINE 發送
 * - Mention
 */


/*
 * =========================================================
 * Reminder 目標
 * =========================================================
 */

export type ReminderTarget =
  | {
      type: 'all';
    }
  | {
      type: 'user';

      userId: string;
    };


/*
 * =========================================================
 * Reminder 資料
 * =========================================================
 */

export interface Reminder {

  id: string;

  groupId: string;

  createdByUserId: string;

  content: string;

  remindAt: string;

  target: ReminderTarget;

  completed: boolean;
}


/*
 * =========================================================
 * 資料檔案
 * =========================================================
 *
 * data/reminders.json
 *
 * 如果 JSON 損壞：
 *
 * 1. 不讓整個 Scheduler 持續報錯
 * 2. 自動把損壞檔案改名保存
 * 3. 建立乾淨的空 Reminder 資料
 *
 * 寫入時：
 *
 * 1. 先寫入暫存檔
 * 2. 寫入成功後才取代正式檔案
 *
 * 避免程式在寫檔途中中斷，
 * 導致 reminders.json 只剩半份內容。
 */


/*
 * =========================================================
 * 資料目錄
 * =========================================================
 */

const DATA_DIRECTORY =
  path.resolve(
    process.cwd(),
    'data',
  );


const REMINDER_FILE =
  path.join(
    DATA_DIRECTORY,
    'reminders.json',
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
 * 驗證 Reminder
 * =========================================================
 */

function isValidReminder(
  reminder: unknown,
): reminder is Reminder {

  if (
    !reminder ||
    typeof reminder !== 'object'
  ) {

    return false;
  }


  const item =
    reminder as Record<string, unknown>;


  if (
    typeof item.id !== 'string' ||
    typeof item.groupId !== 'string' ||
    typeof item.createdByUserId !== 'string' ||
    typeof item.content !== 'string' ||
    typeof item.remindAt !== 'string' ||
    typeof item.completed !== 'boolean'
  ) {

    return false;
  }


  const target =
    item.target;


  if (
    !target ||
    typeof target !== 'object'
  ) {

    return false;
  }


  const reminderTarget =
    target as Record<string, unknown>;


  if (
    reminderTarget.type === 'all'
  ) {

    return true;
  }


  if (
    reminderTarget.type === 'user' &&
    typeof reminderTarget.userId === 'string' &&
    reminderTarget.userId
  ) {

    return true;
  }


  return false;
}


/*
 * =========================================================
 * 損壞檔案處理
 * =========================================================
 */

function backupCorruptedReminderFile(): void {

  if (
    !fs.existsSync(
      REMINDER_FILE,
    )
  ) {

    return;
  }


  const timestamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        '-',
      );


  const backupFile =
    path.join(
      DATA_DIRECTORY,
      `reminders.corrupted-${timestamp}.json`,
    );


  try {

    fs.renameSync(
      REMINDER_FILE,
      backupFile,
    );


    console.error(
      '[Reminder] reminders.json 格式損壞。',
    );


    console.error(
      '[Reminder] 已備份損壞檔案:',
      backupFile,
    );

  } catch (error) {

    console.error(
      '[Reminder] 備份損壞 Reminder 檔案失敗:',
      error,
    );
  }
}


/*
 * =========================================================
 * 讀取所有 Reminder
 * =========================================================
 */

export function loadReminders(): Reminder[] {

  try {

    ensureDataDirectory();


    /*
     * 檔案不存在：
     *
     * 視為目前沒有 Reminder。
     */

    if (
      !fs.existsSync(
        REMINDER_FILE,
      )
    ) {

      return [];
    }


    const content =
      fs.readFileSync(
        REMINDER_FILE,
        'utf8',
      ).trim();


    /*
     * 空檔案：
     *
     * 視為目前沒有 Reminder。
     */

    if (!content) {

      return [];
    }


    const data =
      JSON.parse(
        content,
      );


    /*
     * reminders.json 必須是陣列。
     */

    if (
      !Array.isArray(data)
    ) {

      console.error(
        '[Reminder] reminders.json 不是 Reminder 陣列。',
      );


      backupCorruptedReminderFile();


      return [];
    }


    /*
     * 只保留合法 Reminder。
     */

    const validReminders =
      data.filter(
        (
          reminder,
        ): reminder is Reminder =>
          isValidReminder(
            reminder,
          ),
      );


    /*
     * 如果原始資料存在，
     * 但完全沒有任何合法 Reminder，
     * 不直接視為損壞。
     *
     * 這樣可以允許正常的 []。
     */

    return validReminders;

  } catch (error) {

    console.error(
      '[Reminder] 讀取 Reminder 失敗:',
      error,
    );


    /*
     * JSON.parse 失敗時，
     * 將損壞檔案備份。
     *
     * 下一次 Scheduler 檢查時，
     * 就不會每 30 秒一直讀到同一個壞檔案。
     */

    backupCorruptedReminderFile();


    return [];
  }
}


/*
 * =========================================================
 * 保存所有 Reminder
 * =========================================================
 *
 * 使用暫存檔 + rename，
 * 避免直接覆寫正式檔案時留下半份 JSON。
 * =========================================================
 */

function saveReminders(
  reminders: Reminder[],
): void {

  ensureDataDirectory();


  const temporaryFile =
    `${REMINDER_FILE}.tmp`;


  const content =
    JSON.stringify(
      reminders,
      null,
      2,
    );


  /*
   * 先完整寫入暫存檔。
   */

  fs.writeFileSync(
    temporaryFile,
    content,
    'utf8',
  );


  /*
   * 寫入成功後，
   * 才取代正式檔案。
   */

  fs.renameSync(
    temporaryFile,
    REMINDER_FILE,
  );
}


/*
 * =========================================================
 * 新增 Reminder
 * =========================================================
 */

export function createReminder(
  reminder: Reminder,
): Reminder {

  const reminders =
    loadReminders();


  reminders.push(
    reminder,
  );


  saveReminders(
    reminders,
  );


  console.log(
    '[Reminder] 已建立 Reminder:',
    reminder.id,
  );


  return reminder;
}


/*
 * =========================================================
 * 取得尚未完成的 Reminder
 * =========================================================
 */

export function getPendingReminders():
  Reminder[] {

  return loadReminders().filter(
    (
      reminder,
    ) =>
      !reminder.completed,
  );
}


/*
 * =========================================================
 * 取得已到時間的 Reminder
 * =========================================================
 */

export function getDueReminders(
  now: Date = new Date(),
):
  Reminder[] {

  const nowTime =
    now.getTime();


  return getPendingReminders().filter(
    (
      reminder,
    ) => {

      const remindTime =
        new Date(
          reminder.remindAt,
        ).getTime();


      return (
        !Number.isNaN(
          remindTime,
        ) &&
        remindTime <= nowTime
      );
    },
  );
}


/*
 * =========================================================
 * 完成 Reminder
 * =========================================================
 */

export function completeReminder(
  reminderId: string,
): boolean {

  const reminders =
    loadReminders();


  const reminder =
    reminders.find(
      (
        item,
      ) =>
        item.id === reminderId,
    );


  if (!reminder) {

    return false;
  }


  /*
   * 已經完成就直接視為成功。
   */

  if (
    reminder.completed
  ) {

    return true;
  }


  reminder.completed =
    true;


  saveReminders(
    reminders,
  );


  console.log(
    '[Reminder] Reminder 已完成:',
    reminderId,
  );


  return true;
}