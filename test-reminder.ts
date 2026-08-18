import fs from 'fs';
import {
  createReminder,
  loadReminders,
  getDueReminders,
  completeReminder,
} from './src/reminder';

const testId = `test-${Date.now()}`;

createReminder({
  id: testId,
  groupId: 'test-group',
  createdByUserId: 'test-user',
  content: '測試提醒',
  remindAt: new Date(Date.now() - 1000).toISOString(),
  target: {
    type: 'all',
  },
  completed: false,
});

const loaded = loadReminders();

const created = loaded.find(
  (reminder) =>
    reminder.id === testId,
);

if (!created) {
  throw new Error('建立或讀取 Reminder 失敗');
}

console.log('建立與讀取：成功');

const due = getDueReminders();

const isDue = due.some(
  (reminder) =>
    reminder.id === testId,
);

if (!isDue) {
  throw new Error('到期 Reminder 判斷失敗');
}

console.log('到期判斷：成功');

const completed =
  completeReminder(testId);

if (!completed) {
  throw new Error('完成 Reminder 失敗');
}

const afterComplete =
  loadReminders().find(
    (reminder) =>
      reminder.id === testId,
  );

if (
  !afterComplete ||
  !afterComplete.completed
) {
  throw new Error('完成狀態保存失敗');
}

console.log('完成狀態：成功');

const reminderFile =
  'data/reminders.json';

if (fs.existsSync(reminderFile)) {
  const reminders =
    JSON.parse(
      fs.readFileSync(
        reminderFile,
        'utf8',
      ),
    );

  const remaining =
    reminders.filter(
      (reminder: { id: string }) =>
        reminder.id !== testId,
    );

  fs.writeFileSync(
    reminderFile,
    JSON.stringify(
      remaining,
      null,
      2,
    ),
    'utf8',
  );
}

console.log('測試資料：已清除');
console.log('Reminder 資料層測試全部成功');