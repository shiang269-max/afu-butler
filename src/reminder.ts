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
 * 5. Reminder 查詢
 * 6. Reminder 修改
 * 7. Reminder 取消
 * 8. Reminder 權限判斷
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
 *
 * 舊版：
 *
 * target
 *
 * Reminder 2.0：
 *
 * targets
 *
 * 為了確保現有程式可以平滑升級，
 * target 保留為必要欄位。
 *
 * targets 是新版多人 Reminder 的擴充欄位。
 */


/*
 * =========================================================
 * 單一 Reminder 目標
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
 * 多個 Reminder 目標
 * =========================================================
 */

export type ReminderTargets =
  ReminderTarget[];


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

  /*
   * -------------------------------------------------------
   * 舊版核心欄位
   * -------------------------------------------------------
   *
   * 保留為必要欄位。
   *
   * 現有 index / handler / scheduler
   * 仍然使用 reminder.target。
   */

  target: ReminderTarget;


  /*
   * -------------------------------------------------------
   * Reminder 2.0 多人目標
   * -------------------------------------------------------
   *
   * 一人 Reminder：
   *
   * targets 可以不存在。
   *
   * 多人 Reminder：
   *
   * targets:
   * [
   *   { type: 'user', userId: 'A' },
   *   { type: 'user', userId: 'B' }
   * ]
   *
   * 後續升級其他模組時，
   * 將逐步改用 targets。
   */

  targets?: ReminderTargets;


  /*
   * 是否已完成。
   */

  completed: boolean;


  /*
   * 是否已取消。
   *
   * optional 是為了相容目前既有 Reminder 建立程式。
   *
   * 未存在時視為 false。
   */

  cancelled?: boolean;
}


/*
 * =========================================================
 * Reminder 更新資料
 * =========================================================
 */

export interface ReminderUpdate {

  content?: string;

  remindAt?: string;

  target?: ReminderTarget;

  targets?: ReminderTargets;
}


/*
 * =========================================================
 * Reminder 查詢範圍
 * =========================================================
 */

export type ReminderQueryScope =
  | 'all'
  | 'today'
  | 'tomorrow'
  | 'week'
  | 'month';


/*
 * =========================================================
 * Reminder 查詢條件
 * =========================================================
 */

export interface ReminderQueryOptions {

  groupId?: string;

  createdByUserId?: string;

  targetUserId?: string;

  scope?: ReminderQueryScope;

  now?: Date;
}


/*
 * =========================================================
 * 資料檔案
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
 * 正規化 Reminder Targets
 * =========================================================
 *
 * 新資料：
 *
 * targets
 *
 * 舊資料：
 *
 * target
 *
 * 都可以讀取。
 */


/*
 * =========================================================
 * 去除重複 Targets
 * =========================================================
 */

function normalizeTargets(
  targets: ReminderTargets,
): ReminderTargets {

  if (
    targets.length === 0
  ) {

    return [];
  }


  /*
   * ALL 代表全部，
   * 不需要再保存其他 user target。
   */

  if (
    targets.some(
      (
        target,
      ) =>
        target.type === 'all',
    )
  ) {

    return [
      {
        type: 'all',
      },
    ];
  }


  const seenUsers =
    new Set<string>();


  const result:
    ReminderTargets = [];


  for (
    const target
    of targets
  ) {

    if (
      target.type !== 'user'
    ) {

      continue;
    }


    if (
      !target.userId
    ) {

      continue;
    }


    if (
      seenUsers.has(
        target.userId,
      )
    ) {

      continue;
    }


    seenUsers.add(
      target.userId,
    );


    result.push({
      type: 'user',

      userId:
        target.userId,
    });
  }


  return result;
}


/*
 * =========================================================
 * 取得 Reminder Targets
 * =========================================================
 *
 * 新版優先使用 targets。
 *
 * 如果沒有 targets，
 * 使用舊版 target。
 * =========================================================
 */

export function getReminderTargets(
  reminder: Reminder,
): ReminderTargets {

  if (
    Array.isArray(
      reminder.targets,
    ) &&
    reminder.targets.length > 0
  ) {

    return normalizeTargets(
      reminder.targets,
    );
  }


  return [
    reminder.target,
  ];
}


/*
 * =========================================================
 * 驗證單一 Target
 * =========================================================
 */

function isValidReminderTarget(
  target: unknown,
): target is ReminderTarget {

  if (
    !target ||
    typeof target !== 'object'
  ) {

    return false;
  }


  const item =
    target as Record<string, unknown>;


  if (
    item.type === 'all'
  ) {

    return true;
  }


  return (
    item.type === 'user' &&
    typeof item.userId === 'string' &&
    item.userId.length > 0
  );
}


/*
 * =========================================================
 * 驗證 Reminder
 * =========================================================
 *
 * 同時支援：
 *
 * 舊版：
 *
 * target
 *
 * 新版：
 *
 * target + targets
 *
 * targets 不存在也完全合法。
 */


/*
 * =========================================================
 * 正規化 Reminder
 * =========================================================
 */

function normalizeReminder(
  reminder: unknown,
): Reminder | null {

  if (
    !reminder ||
    typeof reminder !== 'object'
  ) {

    return null;
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

    return null;
  }


  /*
   * -------------------------------------------------------
   * target 是目前既有程式依賴的核心欄位。
   * -------------------------------------------------------
   */

  if (
    !isValidReminderTarget(
      item.target,
    )
  ) {

    /*
     * 如果沒有舊 target，
     * 嘗試從新版 targets 取得第一個目標，
     * 讓未來產生的新資料仍然可以正常讀取。
     */

    if (
      !Array.isArray(
        item.targets,
      )
    ) {

      return null;
    }


    const parsedTargets:
      ReminderTargets = [];


    for (
      const target
      of item.targets
    ) {

      if (
        isValidReminderTarget(
          target,
        )
      ) {

        parsedTargets.push(
          target,
        );
      }
    }


    const normalizedTargets =
      normalizeTargets(
        parsedTargets,
      );


    if (
      normalizedTargets.length === 0
    ) {

      return null;
    }


    /*
     * 多人 Reminder 暫時把第一個 target
     * 放進舊 target 欄位，
     * 讓舊程式仍然可以運作。
     */

    return {

      id:
        item.id,

      groupId:
        item.groupId,

      createdByUserId:
        item.createdByUserId,

      content:
        item.content,

      remindAt:
        item.remindAt,

      target:
        normalizedTargets[0],

      targets:
        normalizedTargets,

      completed:
        item.completed,

      cancelled:
        typeof item.cancelled === 'boolean'
          ? item.cancelled
          : false,
    };
  }


  /*
   * -------------------------------------------------------
   * target 存在。
   * -------------------------------------------------------
   *
   * targets 如果存在就正規化。
   *
   * 如果不存在，
   * 就用 target 建立一份 targets。
   */

  let targets:
    ReminderTargets;


  if (
    Array.isArray(
      item.targets,
    )
  ) {

    const validTargets:
      ReminderTargets = [];


    for (
      const target
      of item.targets
    ) {

      if (
        isValidReminderTarget(
          target,
        )
      ) {

        validTargets.push(
          target,
        );
      }
    }


    targets =
      normalizeTargets(
        validTargets,
      );


    /*
     * targets 存在但內容不合法，
     * 至少保留 target。
     */

    if (
      targets.length === 0
    ) {

      targets = [
        item.target as ReminderTarget,
      ];
    }

  } else {

    targets = [
      item.target as ReminderTarget,
    ];
  }


  return {

    id:
      item.id,

    groupId:
      item.groupId,

    createdByUserId:
      item.createdByUserId,

    content:
      item.content,

    remindAt:
      item.remindAt,

    target:
      item.target as ReminderTarget,

    targets,

    completed:
      item.completed,

    cancelled:
      typeof item.cancelled === 'boolean'
        ? item.cancelled
        : false,
  };
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

export function loadReminders():
  Reminder[] {

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
     * 正規化並保留合法 Reminder。
     */

    return data
      .map(
        (
          reminder,
        ) =>
          normalizeReminder(
            reminder,
          ),
      )
      .filter(
        (
          reminder,
        ): reminder is Reminder =>
          reminder !== null,
      );

  } catch (error) {

    console.error(
      '[Reminder] 讀取 Reminder 失敗:',
      error,
    );


    /*
     * JSON.parse 失敗時，
     * 將損壞檔案備份。
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
 * 正規化建立用 Reminder
 * =========================================================
 */

function normalizeReminderForSave(
  reminder: Reminder,
): Reminder {

  let targets:
    ReminderTargets;


  /*
   * 如果呼叫端已經提供 targets，
   * 使用 targets。
   */

  if (
    Array.isArray(
      reminder.targets,
    ) &&
    reminder.targets.length > 0
  ) {

    targets =
      normalizeTargets(
        reminder.targets,
      );

  } else {

    /*
     * 舊版呼叫端只有 target。
     */

    targets =
      [
        reminder.target,
      ];
  }


  /*
   * 至少必須有一個 target。
   */

  if (
    targets.length === 0
  ) {

    throw new Error(
      'Reminder 必須至少有一個提醒對象。',
    );
  }


  /*
   * 舊 target 保留。
   *
   * 如果原本 target 存在，
   * 優先保留原本 target。
   *
   * 如果是純新版資料，
   * 則使用第一個 target。
   */

  const legacyTarget =
    isValidReminderTarget(
      reminder.target,
    )
      ? reminder.target
      : targets[0];


  return {

    ...reminder,

    target:
      legacyTarget,

    targets,

    cancelled:
      reminder.cancelled === true,
  };
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


  const normalizedReminder =
    normalizeReminderForSave(
      reminder,
    );


  reminders.push(
    normalizedReminder,
  );


  saveReminders(
    reminders,
  );


  console.log(
    '[Reminder] 已建立 Reminder:',
    normalizedReminder.id,
  );


  return normalizedReminder;
}


/*
 * =========================================================
 * 取得有效 Reminder
 * =========================================================
 */

export function getActiveReminders():
  Reminder[] {

  return loadReminders().filter(
    (
      reminder,
    ) =>
      !reminder.completed &&
      reminder.cancelled !== true,
  );
}


/*
 * =========================================================
 * 取得尚未完成的 Reminder
 * =========================================================
 *
 * 保留舊函式名稱，
 * 避免 Scheduler 現有程式需要立即修改。
 * =========================================================
 */

export function getPendingReminders():
  Reminder[] {

  return getActiveReminders();
}


/*
 * =========================================================
 * 取得指定群組有效 Reminder
 * =========================================================
 */

export function getActiveRemindersByGroup(
  groupId: string,
): Reminder[] {

  if (
    !groupId
  ) {

    return [];
  }


  return getActiveReminders().filter(
    (
      reminder,
    ) =>
      reminder.groupId ===
      groupId,
  );
}


/*
 * =========================================================
 * 取得指定建立人的 Reminder
 * =========================================================
 */

export function getActiveRemindersByCreator(
  groupId: string,
  createdByUserId: string,
): Reminder[] {

  if (
    !groupId ||
    !createdByUserId
  ) {

    return [];
  }


  return getActiveRemindersByGroup(
    groupId,
  ).filter(
    (
      reminder,
    ) =>
      reminder.createdByUserId ===
      createdByUserId,
  );
}


/*
 * =========================================================
 * 判斷 Reminder 是否提醒指定使用者
 * =========================================================
 */

export function reminderTargetsUser(
  reminder: Reminder,
  userId: string,
): boolean {

  if (
    !userId
  ) {

    return false;
  }


  const targets =
    getReminderTargets(
      reminder,
    );


  return targets.some(
    (
      target,
    ) => {

      if (
        target.type === 'all'
      ) {

        return true;
      }


      return (
        target.type === 'user' &&
        target.userId ===
        userId
      );
    },
  );
}


/*
 * =========================================================
 * 取得指定被提醒者的 Reminder
 * =========================================================
 */

export function getActiveRemindersByTargetUser(
  groupId: string,
  userId: string,
): Reminder[] {

  if (
    !groupId ||
    !userId
  ) {

    return [];
  }


  return getActiveRemindersByGroup(
    groupId,
  ).filter(
    (
      reminder,
    ) =>
      reminderTargetsUser(
        reminder,
        userId,
      ),
  );
}


/*
 * =========================================================
 * 取得使用者可以管理的 Reminder
 * =========================================================
 *
 * Reminder 2.0 權限：
 *
 * 1. 建立人可以管理
 * 2. 任一被提醒者可以管理
 *
 * 其他家庭成員不能直接取消／修改。
 * =========================================================
 */

export function getActiveRemindersUserCanManage(
  groupId: string,
  userId: string,
): Reminder[] {

  if (
    !groupId ||
    !userId
  ) {

    return [];
  }


  return getActiveRemindersByGroup(
    groupId,
  ).filter(
    (
      reminder,
    ) =>
      canManageReminder(
        reminder,
        userId,
      ),
  );
}


/*
 * =========================================================
 * 判斷使用者是否可以管理 Reminder
 * =========================================================
 */

export function canManageReminder(
  reminder: Reminder,
  userId: string,
): boolean {

  if (
    !userId
  ) {

    return false;
  }


  /*
   * 建立人。
   */

  if (
    reminder.createdByUserId ===
    userId
  ) {

    return true;
  }


  /*
   * 被提醒者。
   */

  return reminderTargetsUser(
    reminder,
    userId,
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


  return getActiveReminders().filter(
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
 * 依 ID 取得 Reminder
 * =========================================================
 */

export function getReminderById(
  reminderId: string,
): Reminder | null {

  if (
    !reminderId
  ) {

    return null;
  }


  const reminders =
    loadReminders();


  return (
    reminders.find(
      (
        reminder,
      ) =>
        reminder.id ===
        reminderId,
    ) ||
    null
  );
}


/*
 * =========================================================
 * 修改 Reminder
 * =========================================================
 */

export function updateReminder(
  reminderId: string,
  updates: ReminderUpdate,
): Reminder | null {

  if (
    !reminderId
  ) {

    return null;
  }


  const reminders =
    loadReminders();


  const reminder =
    reminders.find(
      (
        item,
      ) =>
        item.id ===
        reminderId,
    );


  if (!reminder) {

    return null;
  }


  /*
   * 已完成／已取消的 Reminder
   * 不再允許修改。
   */

  if (
    reminder.completed ||
    reminder.cancelled === true
  ) {

    return null;
  }


  /*
   * 修改內容。
   */

  if (
    typeof updates.content === 'string' &&
    updates.content.trim()
  ) {

    reminder.content =
      updates.content.trim();
  }


  /*
   * 修改時間。
   */

  if (
    typeof updates.remindAt === 'string' &&
    updates.remindAt.trim()
  ) {

    reminder.remindAt =
      updates.remindAt.trim();
  }


  /*
   * -------------------------------------------------------
   * 修改對象
   * -------------------------------------------------------
   *
   * 新版 targets 優先。
   *
   * 舊版 target 仍然支援。
   */

  let updatedTargets:
    ReminderTargets |
    null = null;


  if (
    Array.isArray(
      updates.targets,
    ) &&
    updates.targets.length > 0
  ) {

    updatedTargets =
      normalizeTargets(
        updates.targets,
      );

  } else if (
    updates.target
  ) {

    updatedTargets =
      [
        updates.target,
      ];
  }


  if (
    updatedTargets &&
    updatedTargets.length > 0
  ) {

    reminder.targets =
      updatedTargets;


    /*
     * 保留舊 target。
     *
     * 目前舊程式只認得單一 target，
     * 因此使用第一個 target 作為相容代表。
     */

    reminder.target =
      updatedTargets[0];
  }


  saveReminders(
    reminders,
  );


  console.log(
    '[Reminder] Reminder 已修改:',
    reminderId,
  );


  return reminder;
}


/*
 * =========================================================
 * 取消 Reminder
 * =========================================================
 */

export function cancelReminder(
  reminderId: string,
): boolean {

  if (
    !reminderId
  ) {

    return false;
  }


  const reminders =
    loadReminders();


  const reminder =
    reminders.find(
      (
        item,
      ) =>
        item.id ===
        reminderId,
    );


  if (!reminder) {

    return false;
  }


  /*
   * 已取消：
   *
   * 視為取消成功。
   */

  if (
    reminder.cancelled === true
  ) {

    return true;
  }


  /*
   * 已完成：
   *
   * 不再取消。
   */

  if (
    reminder.completed
  ) {

    return false;
  }


  reminder.cancelled =
    true;


  saveReminders(
    reminders,
  );


  console.log(
    '[Reminder] Reminder 已取消:',
    reminderId,
  );


  return true;
}


/*
 * =========================================================
 * 批次取消 Reminder
 * =========================================================
 */

export function cancelReminders(
  reminderIds: string[],
): number {

  if (
    reminderIds.length === 0
  ) {

    return 0;
  }


  const idSet =
    new Set(
      reminderIds,
    );


  const reminders =
    loadReminders();


  let cancelledCount =
    0;


  for (
    const reminder
    of reminders
  ) {

    if (
      !idSet.has(
        reminder.id,
      )
    ) {

      continue;
    }


    if (
      reminder.completed ||
      reminder.cancelled === true
    ) {

      continue;
    }


    reminder.cancelled =
      true;


    cancelledCount++;
  }


  if (
    cancelledCount > 0
  ) {

    saveReminders(
      reminders,
    );
  }


  console.log(
    '[Reminder] 批次取消 Reminder:',
    cancelledCount,
  );


  return cancelledCount;
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
        item.id ===
        reminderId,
    );


  if (!reminder) {

    return false;
  }


  /*
   * 已完成就直接視為成功。
   */

  if (
    reminder.completed
  ) {

    return true;
  }


  /*
   * 已取消不能再完成。
   */

  if (
    reminder.cancelled === true
  ) {

    return false;
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


/*
 * =========================================================
 * 判斷 Reminder 時間是否相同
 * =========================================================
 */

export function isSameReminderTime(
  reminder: Reminder,
  remindAt: string,
): boolean {

  if (
    !remindAt
  ) {

    return false;
  }


  const existingTime =
    new Date(
      reminder.remindAt,
    ).getTime();


  const newTime =
    new Date(
      remindAt,
    ).getTime();


  if (
    Number.isNaN(
      existingTime,
    ) ||
    Number.isNaN(
      newTime,
    )
  ) {

    return false;
  }


  return (
    existingTime ===
    newTime
  );
}


/*
 * =========================================================
 * 判斷兩組 Reminder Targets 是否有重疊
 * =========================================================
 *
 * 任一方是 ALL：
 *
 * 視為可能重疊。
 *
 * 一般 user target：
 *
 * 只要有相同 userId 就視為重疊。
 * =========================================================
 */

export function reminderTargetsOverlap(
  first: ReminderTargets,
  second: ReminderTargets,
): boolean {

  const normalizedFirst =
    normalizeTargets(
      first,
    );


  const normalizedSecond =
    normalizeTargets(
      second,
    );


  if (
    normalizedFirst.some(
      (
        target,
      ) =>
        target.type === 'all',
    )
  ) {

    return true;
  }


  if (
    normalizedSecond.some(
      (
        target,
      ) =>
        target.type === 'all',
    )
  ) {

    return true;
  }


  const firstUsers =
    new Set<string>();


  for (
    const target
    of normalizedFirst
  ) {

    if (
      target.type === 'user'
    ) {

      firstUsers.add(
        target.userId,
      );
    }
  }


  return normalizedSecond.some(
    (
      target,
    ) =>
      target.type === 'user' &&
      firstUsers.has(
        target.userId,
      ),
  );
}


/*
 * =========================================================
 * 查詢 Reminder
 * =========================================================
 */

export function queryReminders(
  options: ReminderQueryOptions = {},
): Reminder[] {

  const {
    groupId,
    createdByUserId,
    targetUserId,
    scope = 'all',
    now = new Date(),
  } = options;


  let reminders =
    getActiveReminders();


  /*
   * 群組。
   */

  if (
    groupId
  ) {

    reminders =
      reminders.filter(
        (
          reminder,
        ) =>
          reminder.groupId ===
          groupId,
      );
  }


  /*
   * 建立人。
   */

  if (
    createdByUserId
  ) {

    reminders =
      reminders.filter(
        (
          reminder,
        ) =>
          reminder.createdByUserId ===
          createdByUserId,
      );
  }


  /*
   * 被提醒者。
   */

  if (
    targetUserId
  ) {

    reminders =
      reminders.filter(
        (
          reminder,
        ) =>
          reminderTargetsUser(
            reminder,
            targetUserId,
          ),
      );
  }


  /*
   * 日期範圍。
   */

  if (
    scope !== 'all'
  ) {

    reminders =
      reminders.filter(
        (
          reminder,
        ) =>
          isReminderInScope(
            reminder,
            scope,
            now,
          ),
      );
  }


  /*
   * 依時間由早到晚排序。
   */

  reminders.sort(
    (
      first,
      second,
    ) => {

      const firstTime =
        new Date(
          first.remindAt,
        ).getTime();


      const secondTime =
        new Date(
          second.remindAt,
        ).getTime();


      return (
        firstTime -
        secondTime
      );
    },
  );


  return reminders;
}


/*
 * =========================================================
 * Reminder 日期範圍判斷
 * ========================================================= */

function isReminderInScope(
  reminder: Reminder,
  scope: ReminderQueryScope,
  now: Date,
): boolean {

  const remindDate =
    new Date(
      reminder.remindAt,
    );


  if (
    Number.isNaN(
      remindDate.getTime(),
    )
  ) {

    return false;
  }


  const currentDate =
    getTaipeiDateParts(
      now,
    );


  const reminderDate =
    getTaipeiDateParts(
      remindDate,
    );


  const currentKey =
    createDateKey(
      currentDate.year,
      currentDate.month,
      currentDate.day,
    );


  const reminderKey =
    createDateKey(
      reminderDate.year,
      reminderDate.month,
      reminderDate.day,
    );


  /*
   * 今天。
   */

  if (
    scope === 'today'
  ) {

    return (
      reminderKey ===
      currentKey
    );
  }


  /*
   * 明天。
   */

  if (
    scope === 'tomorrow'
  ) {

    const tomorrow =
      addDays(
        currentDate,
        1,
      );


    return (
      reminderKey ===
      createDateKey(
        tomorrow.year,
        tomorrow.month,
        tomorrow.day,
      )
    );
  }


  /*
   * 本週。
   *
   * 週一～週日。
   */

  if (
    scope === 'week'
  ) {

    const start =
      getStartOfWeek(
        currentDate,
      );


    const end =
      addDays(
        start,
        7,
      );


    const reminderTimestamp =
      dateKeyToTimestamp(
        reminderDate,
      );


    const startTimestamp =
      dateKeyToTimestamp(
        start,
      );


    const endTimestamp =
      dateKeyToTimestamp(
        end,
      );


    return (
      reminderTimestamp >=
      startTimestamp &&
      reminderTimestamp <
      endTimestamp
    );
  }


  /*
   * 本月。
   */

  if (
    scope === 'month'
  ) {

    return (
      reminderDate.year ===
      currentDate.year &&
      reminderDate.month ===
      currentDate.month
    );
  }


  return true;
}


/*
 * =========================================================
 * 台灣日期資料
 * ========================================================= */

interface TaipeiDateParts {

  year: number;

  month: number;

  day: number;
}


/*
 * =========================================================
 * 取得 Asia/Taipei 日期
 * ========================================================= */

function getTaipeiDateParts(
  date: Date,
): TaipeiDateParts {

  const parts =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Asia/Taipei',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',
      },
    ).formatToParts(
      date,
    );


  const getPart =
    (
      type: string,
    ): number => {

      const part =
        parts.find(
          (
            item,
          ) =>
            item.type ===
            type,
        );


      return part
        ? Number(
            part.value,
          )
        : 0;
    };


  return {

    year:
      getPart(
        'year',
      ),

    month:
      getPart(
        'month',
      ),

    day:
      getPart(
        'day',
      ),
  };
}


/*
 * =========================================================
 * 建立日期 Key
 * ========================================================= */

function createDateKey(
  year: number,
  month: number,
  day: number,
): string {

  return (
    `${year.toString().padStart(4, '0')}-` +
    `${month.toString().padStart(2, '0')}-` +
    `${day.toString().padStart(2, '0')}`
  );
}


/*
 * =========================================================
 * 日期加減
 * ========================================================= */

function addDays(
  date: TaipeiDateParts,
  days: number,
): TaipeiDateParts {

  const timestamp =
    Date.UTC(
      date.year,
      date.month - 1,
      date.day,
    );


  const result =
    new Date(
      timestamp +
      days *
      24 *
      60 *
      60 *
      1000,
    );


  return {

    year:
      result.getUTCFullYear(),

    month:
      result.getUTCMonth() + 1,

    day:
      result.getUTCDate(),
  };
}


/*
 * =========================================================
 * 取得本週開始日期
 * =========================================================
 *
 * 週一為一週第一天。
 * ========================================================= */

function getStartOfWeek(
  date: TaipeiDateParts,
): TaipeiDateParts {

  const timestamp =
    Date.UTC(
      date.year,
      date.month - 1,
      date.day,
    );


  const current =
    new Date(
      timestamp,
    );


  const day =
    current.getUTCDay();


  /*
   * Sunday = 0
   * Monday = 1
   */

  const daysFromMonday =
    day === 0
      ? 6
      : day - 1;


  return addDays(
    date,
    -daysFromMonday,
  );
}


/*
 * =========================================================
 * 日期 → Timestamp
 * ========================================================= */

function dateKeyToTimestamp(
  date: TaipeiDateParts,
): number {

  return Date.UTC(
    date.year,
    date.month - 1,
    date.day,
  );
}