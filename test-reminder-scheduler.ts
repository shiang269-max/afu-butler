import {
  createReminder,
  loadReminders,
} from './src/reminder';

import {
  checkReminders,
} from './src/proactive-scheduler';

import fs from 'fs';


async function main(): Promise<void> {

  const testId =
    `mock-test-${Date.now()}`;


  createReminder({
    id:
      testId,

    groupId:
      'TEST_GROUP',

    createdByUserId:
      'TEST_USER',

    content:
      'Mock Reminder 測試',

    remindAt:
      new Date(
        Date.now() - 1000,
      ).toISOString(),

    target: {
  type:
    'all',
},

    completed:
      false,
  });


  const calls: unknown[] = [];


  const mockLineClient = {

    pushMessage:
      async (
        message: unknown,
      ) => {

        calls.push(
          message,
        );

        console.log(
          '[MOCK] pushMessage 被呼叫',
        );

        console.log(
          JSON.stringify(
            message,
            null,
            2,
          ),
        );
      },

  } as any;


  await checkReminders(
    mockLineClient,
  );


  const reminder =
    loadReminders().find(
      (
        item,
      ) =>
        item.id === testId,
    );


  if (
    calls.length !== 1
  ) {

    throw new Error(
      `預期 pushMessage 1 次，實際 ${calls.length} 次`,
    );
  }


  if (
    !reminder ||
    !reminder.completed
  ) {

    throw new Error(
      'Reminder 沒有被標記為 completed',
    );
  }


  console.log(
    'Mock Scheduler 測試成功',
  );


  const reminderFile =
    'data/reminders.json';


  if (
    fs.existsSync(
      reminderFile,
    )
  ) {

    const data =
      JSON.parse(
        fs.readFileSync(
          reminderFile,
          'utf8',
        ),
      );


    const remaining =
      data.filter(
        (
          item: { id: string },
        ) =>
          item.id !== testId,
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


  console.log(
    '測試資料：已清除',
  );
}


main().catch(
  (error) => {

    console.error(
      error,
    );

    process.exit(
      1,
    );
  },
);