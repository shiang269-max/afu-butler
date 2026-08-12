import express from 'express';
import {
  SignatureValidationFailed,
  JSONParseError,
  middleware,
  webhook,
  messagingApi,
} from '@line/bot-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

const client = new messagingApi.MessagingApiClient({
  channelAccessToken,
});

const lineMiddleware = middleware({
  channelSecret,
});

app.get('/', (req, res) => {
  res.send('LINE第五個家人正在運作');
});

app.post('/webhook', lineMiddleware, async (req, res) => {
  const body = req.body as webhook.CallbackRequest;
  const events = body.events;

  try {
    await Promise.all(
      events.map(async (event) => {
        if (event.type === 'message' && event.message.type === 'text') {
          if (!event.replyToken) {
            return;
          }

          await client.replyMessage({
            replyToken: event.replyToken,
            messages: [
              {
                type: 'text',
                text: '收到，我正在學習怎麼陪你聊天。',
              },
            ],
          });
        }
      })
    );

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err instanceof SignatureValidationFailed) {
      res.status(401).send(err.signature);
      return;
    }

    if (err instanceof JSONParseError) {
      res.status(400).send(err.raw);
      return;
    }

    next(err);
  }
);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('LINE第五個家人正在啟動');
});