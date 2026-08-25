import {
  Vote,
  VoteOptionSource,
  startVote,
  getActiveVote,
  setVoteOptionSource,
  setExpectedVoterCount,
  addVoteOptions,
  removeVoteOption,
  startVoting,
  castVote,
  finishVote,
  resolveVoteTie,
} from './vote';


export interface VoteHandlerResult {
  handled: boolean;
  message?: string;
  action?: 'REPLY' | 'GENERATE_OPTIONS';
  generatePrompt?: string;
}


export interface VoteHandlerOptions {
  groupId: string;
  userId: string;
  message: string;
  generateOptions?: (
    prompt: string,
  ) => Promise<string[]>;
}

interface PendingVoteStart {
  title: string;
  createdBy: string;
  suppliedOptions: string[];
}

const pendingVoteStarts =
  new Map<string, PendingVoteStart>();


/**
 * Vote conversation state is stored in vote.ts.
 * This file only translates natural-language LINE messages
 * into vote.ts operations.
 *
 * No Persona / style / palace wording is stored here.
 */


/**
 * Normalize common controller invocation words.
 */
function cleanTriggerWords(
  message: string,
): string {
  return message
    .replace(/大內總管/g, '')
    .replace(/總管/g, '')
    .replace(/內內/g, '')
    .replace(/喳子/g, '')
    .replace(/渣子/g, '')
    .replace(/阿福/g, '')
    .trim();
}


/**
 * Detect whether a NEW vote explicitly calls the butler.
 * Existing SETUP / ACTIVE / TIE messages do not require a call word.
 */
function hasRequiredVoteInvocation(
  message: string,
): boolean {
  return [
    '大內總管',
    '總管',
    '內內',
    '喳子',
    '渣子',
    '阿福',
  ].some(
    (word) =>
      message.includes(word),
  );
}


/**
 * Decide whether this message is explicitly asking to start a vote.
 *
 * Deliberately conservative so ordinary conversation is not
 * swallowed by the vote system.
 */
function hasVoteStartIntent(
  message: string,
): boolean {
  const text =
    cleanTriggerWords(message);

  if (!text) {
    return false;
  }

  const normalized =
    text
      .replace(/\s+/g, '');

  if (
    /^(?:結束投票|完成投票|結束這次投票|投票完成)$/.test(
      normalized,
    )
  ) {
    return false;
  }

  return [
    '開投票',
    '建立投票',
    '發起投票',
    '投票一下',
    '投票決定',
    '投票決定一下',
    '我們投票',
    '大家投票',
    '一起投票',
    '投票',
  ].some(
    (keyword) =>
      text.includes(keyword),
  );
}


/**
 * Parse a topic from a start-vote message.
 */
function parseVoteTitle(
  message: string,
): string {
  let text =
    cleanTriggerWords(message)
      .replace(/^[，,、：:；;。！？!?\s]+/, '')
      .trim();

  const startPhrases = [
    '我們要投票',
    '大家要投票',
    '一起來投票',
    '一起投票',
    '投票決定一下',
    '投票決定',
    '投票一下',
    '開投票',
    '建立投票',
    '發起投票',
    '我們投票',
    '大家投票',
    '投票',
  ];

  for (const phrase of startPhrases) {
    const pattern =
      new RegExp(
        `^${phrase}[\\s，,、：:；;。！？!?]*`,
      );

    if (pattern.test(text)) {
      text =
        text
          .replace(
            pattern,
            '',
          )
          .replace(
            /^[，,、：:；;。！？!?\\s]+/,
            '',
          )
          .trim();

      break;
    }
  }

  text =
    text
      .replace(
        /^要投票[\\s，,、：:；;。！？!?]*/,
        '',
      )
      .replace(
        /^幫我們投票[\\s，,、：:；;。！？!?]*/,
        '',
      )
      .replace(
        /^幫我投票[\\s，,、：:；;。！？!?]*/,
        '',
      )
      .replace(
        /^(幫我們|幫我|我們|大家|一起)[\\s，,、：:；;。！？!?]*/,
        '',
      )
      .replace(
        /^決定[\\s，,、：:；;。！？!?]*/,
        '',
      )
      .replace(
        /^[，,、：:；;。！？!?\\s]+/,
        '',
      )
      .trim();

  return text
    .replace(/[。！!？?]+$/g, '')
    .trim();
}



/**
 * Parse explicitly supplied options.
 */
function parseInlineOptions(
  message: string,
): string[] {
  const cleaned =
    cleanTriggerWords(message);

  const colonIndex =
    cleaned.search(/[:：]/);

  const optionText =
    colonIndex >= 0
      ? cleaned
          .slice(
            colonIndex + 1,
          )
          .trim()
      : cleaned;

  if (!optionText) {
    return [];
  }

  const parsed =
    optionText
      .split(/[、,，\/]/)
      .map(
        (item) =>
          item
            .replace(
              /^\s*\d+[.)、．]\s*/,
              '',
            )
            .trim(),
      )
      .filter(Boolean);

  /*
   * A delimiter-only message such as
   * 「火鍋、燒肉、牛肉麵」
   * is a valid candidate-options response.
   * A normal sentence without at least two parts is not.
   */
  if (
    colonIndex < 0 &&
    parsed.length < 2
  ) {
    return [];
  }

  return parsed;
}


/**
 * Parse options supplied as separate lines.
 */
function parseMultilineOptions(
  message: string,
): string[] {
  const lines =
    message
      .split(/\r?\n/)
      .map(
        (line) =>
          line
            .replace(
              /^\s*\d+[.)、．]\s*/,
              '',
            )
            .trim(),
      )
      .filter(Boolean);

  if (lines.length < 3) {
    return [];
  }

  return lines
    .slice(1)
    .filter(
      (line) =>
        line.length > 0,
    );
}


/**
 * Detect explicit "member-supplied options" responses.
 */
function isMemberOptionSource(
  message: string,
): boolean {
  const text =
    message
      .replace(/\s+/g, '')
      .toLowerCase();

  return [
    '自己提供',
    '我們提供',
    '大家提供',
    '家人提供',
    '我們出選項',
    '自己出選項',
    '我們自己來',
    '自己來',
  ].some(
    (phrase) =>
      text.includes(phrase),
  );
}


/**
 * Detect explicit "AI-supplied options" responses.
 */
function isAiOptionSource(
  message: string,
): boolean {
  const text =
    message
      .replace(/\s+/g, '')
      .toLowerCase();

  return [
    '你提供',
    '總管提供',
    '由你提供',
    '由總管提供',
    '幫我們提供',
    '幫忙提供',
    '你幫我想',
    '你來提供',
    '你出選項',
  ].some(
    (phrase) =>
      text.includes(phrase),
  );
}


/**
 * Parse a participant count.
 *
 * Examples:
 * 4
 * 4人
 * 我們4個
 * 四個
 */
function parseParticipantCount(
  message: string,
): number | null {
  const normalized =
    message
      .replace(/\s+/g, '')
      .trim();

  const digitMatch =
    normalized.match(
      /(?:^|[^\d])(\d{1,3})(?:人|個)?(?:$|[^\d])/,
    );

  if (digitMatch?.[1]) {
    const count =
      Number(
        digitMatch[1],
      );

    if (
      Number.isInteger(count) &&
      count >= 1 &&
      count <= 200
    ) {
      return count;
    }
  }

  const chineseNumbers: Record<string, number> = {
    '一': 1,
    '二': 2,
    '兩': 2,
    '三': 3,
    '四': 4,
    '五': 5,
    '六': 6,
    '七': 7,
    '八': 8,
    '九': 9,
    '十': 10,
  };

  for (
    const [word, value]
    of Object.entries(chineseNumbers)
  ) {
    if (
      normalized === word ||
      normalized === `${word}人` ||
      normalized === `${word}個`
    ) {
      return value;
    }
  }

  return null;
}


/**
 * Conservative explicit vote expressions.
 *
 * The bare option number / option text is accepted only when
 * the vote is already ACTIVE.
 */
function parseExplicitVoteInput(
  vote: Vote,
  message: string,
): string | null {
  const text =
    message
      .trim()
      .replace(/\s+/g, ' ');

  if (!text) {
    return null;
  }

  if (/^\d+$/.test(text)) {
    return text;
  }

  const patterns = [
    /^(?:我要投|我要|我投|我選擇|我選)\s*(.+)$/i,
    /^選\s*(.+)$/,
    /^投\s*(.+)$/,
    /^改投\s*(.+)$/,
    /^改成\s*(.+)$/,
    /^我要改成\s*(.+)$/,
  ];

  for (const pattern of patterns) {
    const match =
      text.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  /**
   * Exact option text alone is valid.
   * A sentence containing the option text is NOT.
   */
  const exactOption =
    vote.options.find(
      (option) =>
        option.text ===
        text,
    );

  return exactOption
    ? exactOption.text
    : null;
}


/**
 * Detect "not this option" during candidate collection.
 *
 * It is intentionally restricted to candidate-collection phase.
 * Therefore "我不想吃火鍋" cannot become a vote after voting starts.
 */
function parseRejectedOption(
  vote: Vote,
  message: string,
): Vote['options'][number] | null {
  const text =
    message
      .trim()
      .replace(/\s+/g, ' ');

  const negativePatterns = [
    /^我不想吃(.+)$/,
    /^不想吃(.+)$/,
    /^不要吃(.+)$/,
    /^不想要(.+)$/,
    /^不要(.+)$/,
    /^不選(.+)$/,
    /^不要選(.+)$/,
    /^我不要(.+)$/,
  ];

  for (
    const pattern
    of negativePatterns
  ) {
    const match =
      text.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const candidate =
      match[1].trim();

    const exactCandidates = [
      candidate,
      /^我不想吃/.test(text) || /^不想吃/.test(text)
        ? `吃${candidate}`
        : candidate,
    ];

    const exact =
      vote.options.find(
        (option) =>
          exactCandidates.includes(option.text),
      );

    if (exact) {
      return exact;
    }
  }

  return null;
}



function isConfirmCommand(
  message: string,
): boolean {
  const text =
    message
      .replace(/\s+/g, '')
      .toLowerCase();

  return [
    '是',
    '好',
    '可以',
    '好啊',
    '可以啊',
    '確認',
    '確定',
    '結束',
    '結束上一輪',
    '先結束',
    '同意',
  ].includes(text);
}


function isStartCommand(
  message: string,
): boolean {
  const text =
    message
      .replace(/\s+/g, '');

  return [
    '開始',
    '開始投票',
    '可以開始',
    '確認開始',
  ].includes(text);
}


function isTieRevoteCommand(
  message: string,
): boolean {
  const text =
    message
      .replace(/\s+/g, '')
      .toLowerCase();

  return [
    '1',
    '平手再投',
    '平手重新投票',
    '只投平手項目',
    '只重投平手',
    '只投平手',
  ].includes(text);
}


function isTieAddOptionsCommand(
  message: string,
): boolean {
  const text =
    message
      .replace(/\s+/g, '')
      .toLowerCase();

  return [
    '2',
    '加入其他選項',
    '保留平手加入其他',
    '新增選項',
    '加其他選項',
  ].includes(text);
}


/**
 * Build a neutral, functional response.
 *
 * These strings intentionally contain no Persona-specific
 * vocabulary and can later be moved to a response/persona layer.
 */
function setupPrompt(): string {
  return [
    '已建立投票準備。',
    '',
    '請先決定候選選項由哪一方提供：',
    '1. 大家自己提供',
    '2. 由系統協助提供',
  ].join('\n');
}


function participantPrompt(): string {
  return '請告訴我這次有幾位參與投票。';
}


function optionsPrompt(): string {
  return [
    '請提供本次投票的候選選項。',
    '可以直接用「火鍋、燒肉、牛肉麵」這種方式提供。',
  ].join('\n');
}


function readyPrompt(
  vote: Vote,
): string {
  const options =
    vote.options
      .map(
        (option, index) =>
          `${index + 1}. ${option.text}`,
      )
      .join('\n');

  return [
    '候選項目已準備完成。',
    '',
    options,
    '',
    `本次共有 ${vote.expectedVoterCount} 人參與。`,
    '確認後即可開始投票。',
  ].join('\n');
}


function activePrompt(
  vote: Vote,
): string {
  const options =
    vote.options
      .map(
        (option, index) =>
          `${index + 1}. ${option.text}`,
      )
      .join('\n');

  return [
    `投票開始：${vote.title}`,
    '',
    options,
    '',
    '可以直接輸入編號、選項名稱，或使用「我要投燒肉」這類說法。',
    `需要 ${vote.expectedVoterCount} 人完成投票。`,
  ].join('\n');
}


function tiePrompt(
  vote: Vote,
): string {
  const tied =
    vote.options
      .filter(
        (option) =>
          vote.tiedOptionIds.includes(
            option.id,
          ),
      )
      .map(
        (option, index) =>
          `${index + 1}. ${option.text}`,
      )
      .join('\n');

  return [
    '投票結果平手：',
    '',
    tied,
    '',
    '請選擇：',
    '1. 只針對平手項目再次投票',
    '2. 保留平手項目並加入其他候選項目',
  ].join('\n');
}


function finishPrompt(
  result: ReturnType<typeof finishVote>,
): string {
  const lines =
    result.result.results
      .map(
        (item, index) =>
          `${index + 1}. ${item.text}：${item.votes} 票`,
      )
      .join('\n');

  if (result.state === 'EMPTY') {
    return [
      `投票「${result.vote.title}」已結束。`,
      '',
      '沒有收到任何投票。',
    ].join('\n');
  }

  if (result.state === 'TIE') {
    const tied =
      result.result.winners
        .map(
          (item) =>
            item.text,
        )
        .join('、');

    return [
      `投票「${result.vote.title}」已完成。`,
      '',
      lines,
      '',
      `最高票為：${tied}`,
      '',
      tiePrompt(
        result.vote,
      ),
    ].join('\n');
  }

  const winner =
    result.result.winners[0];

  return [
    `投票「${result.vote.title}」已完成。`,
    '',
    lines,
    '',
    `結果：${winner?.text || '無法判定'}`,
  ].join('\n');
}


async function generateOptionsForVote(
  vote: Vote,
  options?: VoteHandlerOptions,
): Promise<string[]> {
  if (!options?.generateOptions) {
    return [];
  }

  const existingOptions =
    vote.options
      .map(
        (option) =>
          option.text,
      )
      .join(
        '、',
      );

  const prompt = [
    `投票題目：${vote.title}`,
    '',
    existingOptions
      ? `目前已有候選項目：${existingOptions}`
      : '目前還沒有候選項目。',
    '',
    '請提供 4 個彼此不同、合理、適合這個投票題目的候選選項。',
    '不要重複目前已有的候選項目。',
    '只輸出候選項目，每行一個。',
    '不要編號。',
    '不要說明原因。',
    '不要加入開頭或結尾文字。',
  ].join('\n');

  return options.generateOptions(
    prompt,
  );
}


async function beginNewVote(
  groupId: string,
  userId: string,
  title: string,
  suppliedOptions: string[],
  options?: VoteHandlerOptions,
): Promise<VoteHandlerResult> {
  const vote =
    startVote({
      groupId,
      title,
      createdBy: userId,
    });

  /**
   * When options were explicitly supplied by the user,
   * source is already determined as MEMBERS.
   */
  if (suppliedOptions.length >= 2) {
    setVoteOptionSource({
      groupId,
      optionSource:
        'MEMBERS',
    });

    addVoteOptions(
      groupId,
      suppliedOptions,
    );

    return {
      handled: true,
      message:
        participantPrompt(),
    };
  }

  return {
    handled: true,
    message:
      setupPrompt(),
  };
}


function isVoteConflictConfirm(
  message: string,
): boolean {
  return isConfirmCommand(message);
}


function isVoteConflictReject(
  message: string,
): boolean {
  const text =
    message
      .replace(/\s+/g, '')
      .toLowerCase();

  return [
    '否',
    '不要',
    '取消',
    '不用',
    '繼續上一場',
    '先不要',
  ].includes(text);
}


async function handlePendingVoteStart(
  options: VoteHandlerOptions,
): Promise<VoteHandlerResult | null> {
  const {
    groupId,
    message,
  } = options;

  const pending =
    pendingVoteStarts.get(
      groupId,
    );

  if (!pending) {
    return null;
  }

  if (
    isVoteConflictReject(
      message,
    )
  ) {
    pendingVoteStarts.delete(
      groupId,
    );

    return {
      handled: true,
      message:
        '已保留目前進行中的投票。',
    };
  }

  if (
    !isVoteConflictConfirm(
      message,
    )
  ) {
    return {
      handled: true,
      message:
        '目前已有一場投票進行中。請回覆「是」先結束目前投票，或回覆「否」保留目前投票。',
    };
  }

  const currentVote =
    getActiveVote(
      groupId,
    );

  if (!currentVote) {
    pendingVoteStarts.delete(
      groupId,
    );

    return await beginNewVote(
      groupId,
      pending.createdBy,
      pending.title,
      pending.suppliedOptions,
      options,
    );
  }

  try {
    const finished =
      finishVote(
        groupId,
      );

    /**
     * A tied vote cannot be replaced silently.
     * The current vote remains active in TIE state.
     */
    if (
      finished.state ===
      'TIE'
    ) {
      pendingVoteStarts.delete(
        groupId,
      );

      return {
        handled: true,
        message:
          [
            finishPrompt(
              finished,
            ),
            '',
            '請先處理這場平手投票，再建立新的投票。',
          ].join('\n'),
      };
    }

    pendingVoteStarts.delete(
      groupId,
    );

    return await beginNewVote(
      groupId,
      pending.createdBy,
      pending.title,
      pending.suppliedOptions,
      options,
    );
  } catch (error) {
    return {
      handled: true,
      message:
        error instanceof Error
          ? error.message
          : '結束目前投票時發生問題。',
    };
  }
}


export async function handleVoteMessage(
  options: VoteHandlerOptions,
): Promise<VoteHandlerResult> {
  const {
    groupId,
    userId,
    message,
  } = options;

  const text =
    message.trim();

  if (!text) {
    return {
      handled: false,
    };
  }

  let vote =
    getActiveVote(
      groupId,
    );


  /**
   * If the user is answering the "finish the current vote
   * before starting a new one" question, handle that first.
   */
  const pendingResult =
    await handlePendingVoteStart(
      options,
    );

  if (pendingResult) {
    return pendingResult;
  }


  /**
   * =======================================================
   * Existing setup / active vote always gets first priority.
   * This is important for:
   *
   * 1
   * 我要1
   * 火鍋
   * 改投燒肉
   *
   * not being sent into ordinary AI chat.
   * =======================================================
   */
  if (vote) {

    if (
      hasVoteStartIntent(
        text,
      )
    ) {
      const title =
        parseVoteTitle(
          text,
        );

      if (title) {
        const inlineOptions =
          parseInlineOptions(
            text,
          );

        const multilineOptions =
          parseMultilineOptions(
            text,
          );

        const suppliedOptions =
          inlineOptions.length >= 2
            ? inlineOptions
            : multilineOptions;

        pendingVoteStarts.set(
          groupId,
          {
            title,
            createdBy:
              userId,
            suppliedOptions,
          },
        );

        return {
          handled: true,
          message:
            `目前已有一場「${vote.title}」投票進行中。` +
            '是否先結束目前投票，再建立新的投票？',
        };
      }
    }

    /**
     * -------------------------------------------------------
     * SETUP
     * -------------------------------------------------------
     */
    if (
      vote.status ===
      'SETUP'
    ) {

      const normalizedSetupChoice =
        text
          .replace(/\s+/g, '')
          .toLowerCase();

      const choseMembers =
        normalizedSetupChoice === '1'
        ||
        isMemberOptionSource(text);

      const choseAI =
        normalizedSetupChoice === '2'
        ||
        isAiOptionSource(text);

      if (
        choseMembers
        ||
        choseAI
      ) {

        const source:
          VoteOptionSource =
          choseAI
            ? 'AI'
            : 'MEMBERS';

        setVoteOptionSource({
          groupId,
          optionSource:
            source,
        });

        return {
          handled: true,
          message:
            source === 'AI'
              ? [
                  '已選擇由系統協助提供候選項目。',
                  '',
                  participantPrompt(),
                ].join('\n')
              : [
                  '已選擇由大家提供候選項目。',
                  '',
                  optionsPrompt(),
                ].join('\n'),
        };
      }


      const count =
        parseParticipantCount(
          text,
        );


      if (
        count !== null
      ) {

        setExpectedVoterCount({
          groupId,
          expectedVoterCount:
            count,
        });

        return {
          handled: true,
          message:
            vote.optionSource ===
            'AI'
              ? '請稍候，我會先建立候選項目。'
              : optionsPrompt(),
        };
      }


      return {
        handled: true,
        message:
          setupPrompt(),
      };
    }


    /**
     * -------------------------------------------------------
     * COLLECTING_OPTIONS
     * -------------------------------------------------------
     */
    if (
      vote.status ===
      'COLLECTING_OPTIONS'
    ) {

      const count =
        parseParticipantCount(
          text,
        );


      if (
        count !== null
      ) {

        setExpectedVoterCount({
          groupId,
          expectedVoterCount:
            count,
        });

        vote =
          getActiveVote(
            groupId,
          )!;

        if (
          vote.optionSource ===
          'AI'
        ) {

          const aiOptions =
            await generateOptionsForVote(
              vote,
              options,
            );

          if (
            aiOptions.length >= 2
          ) {

            addVoteOptions(
              groupId,
              aiOptions,
            );

            const readyVote =
              getActiveVote(
                groupId,
              )!;

            return {
              handled: true,
              message:
                readyPrompt(
                  readyVote,
                ),
            };
          }
        }

        return {
          handled: true,
          message:
            optionsPrompt(),
        };
      }


      const rejected =
        parseRejectedOption(
          vote,
          text,
        );

      if (
        rejected
        &&
        vote.optionSource ===
        'AI'
      ) {

        removeVoteOption(
          groupId,
          rejected.text,
        );

        vote =
          getActiveVote(
            groupId,
          )!;

        const replacements =
          await generateOptionsForVote(
            vote,
            options,
          );

        if (
          replacements.length
        ) {

          addVoteOptions(
            groupId,
            replacements.slice(
              0,
              1,
            ),
          );
        }

        const updated =
          getActiveVote(
            groupId,
          )!;

        if (
          updated.expectedVoterCount !==
            null &&
          updated.options.length >= 2
        ) {
          return {
            handled: true,
            message:
              readyPrompt(
                updated,
              ),
          };
        }

        return {
          handled: true,
          message: [
            `已移除：「${rejected.text}」。`,
            '',
            optionsPrompt(),
          ].join('\n'),
        };
      }


      const inlineOptions =
        parseInlineOptions(
          text,
        );

      const multilineOptions =
        parseMultilineOptions(
          text,
        );

      const suppliedOptions =
        inlineOptions.length >= 2
          ? inlineOptions
          : multilineOptions;


      if (
        suppliedOptions.length
      ) {

        addVoteOptions(
          groupId,
          suppliedOptions,
        );

        vote =
          getActiveVote(
            groupId,
          )!;

        if (
          vote.expectedVoterCount !==
            null &&
          vote.options.length >= 2
        ) {

          return {
            handled: true,
            message:
              readyPrompt(
                vote,
              ),
          };
        }

        return {
          handled: true,
          message:
            participantPrompt(),
        };
      }


      if (
        vote.optionSource ===
        'AI'
      ) {
        const rejected =
          parseRejectedOption(
            vote,
            text,
          );

        if (rejected) {
          removeVoteOption(
            groupId,
            rejected.text,
          );

          vote =
            getActiveVote(
              groupId,
            )!;

          const replacements =
            await generateOptionsForVote(
              vote,
              options,
            );

          if (
            replacements.length
          ) {
            addVoteOptions(
              groupId,
              replacements.slice(0, 1),
            );
          }

          const updated =
            getActiveVote(
              groupId,
            )!;

          return {
            handled: true,
            message:
              updated.options.length >= 2
                ? readyPrompt(updated)
                : [
                    `已移除：「${rejected.text}」。`,
                    '',
                    optionsPrompt(),
                  ].join('\n'),
          };
        }
      }


      if (
        isStartCommand(
          text,
        )
      ) {

        return {
          handled: true,
          message:
            optionsPrompt(),
        };
      }


      return {
        handled: true,
        message:
          vote.optionSource ===
          'AI'
            ? [
                '候選項目目前仍在整理。',
                '可以直接說不想要哪一項，我會將它移除並補上新的候選項目。',
              ].join('\n')
            : optionsPrompt(),
      };
    }


    /**
     * -------------------------------------------------------
     * READY
     * -------------------------------------------------------
     */
    if (
      vote.status ===
      'READY'
    ) {

      const count =
        parseParticipantCount(
          text,
        );

      if (
        count !== null
      ) {
        setExpectedVoterCount({
          groupId,
          expectedVoterCount:
            count,
        });

        vote =
          getActiveVote(
            groupId,
          )!;

        if (
          vote.expectedVoterCount !==
            null
        ) {
          return {
            handled: true,
            message:
              readyPrompt(
                vote,
              ),
          };
        }
      }


      if (
        vote.optionSource ===
        'AI'
      ) {
        const rejected =
          parseRejectedOption(
            vote,
            text,
          );

        if (rejected) {
          removeVoteOption(
            groupId,
            rejected.text,
          );

          vote =
            getActiveVote(
              groupId,
            )!;

          const replacements =
            await generateOptionsForVote(
              vote,
              options,
            );

          if (
            replacements.length
          ) {
            addVoteOptions(
              groupId,
              replacements.slice(
                0,
                1,
              ),
            );
          }

          const updated =
            getActiveVote(
              groupId,
            )!;

          return {
            handled: true,
            message:
              updated.expectedVoterCount !==
                null &&
              updated.options.length >= 2
                ? readyPrompt(
                    updated,
                  )
                : [
                    `已移除：「${rejected.text}」。`,
                    '',
                    optionsPrompt(),
                  ].join('\\n'),
          };
        }
      }


      if (
        isStartCommand(
          text,
        )
      ) {

        try {

          const started =
            startVoting(
              groupId,
            );

          return {
            handled: true,
            message:
              activePrompt(
                started,
              ),
          };

        } catch (error) {

          return {
            handled: true,
            message:
              error instanceof Error
                ? error.message
                : '目前尚未完成投票準備。',
          };
        }
      }


      return {
        handled: true,
        message:
          readyPrompt(
            vote,
          ),
      };
    }


    /**
     * -------------------------------------------------------
     * ACTIVE
     * -------------------------------------------------------
     */
    if (
      vote.status ===
      'ACTIVE'
    ) {

      if (
        /^(?:結束投票|完成投票|結束這次投票|投票完成)$/.test(
          text
            .replace(/\s+/g, ''),
        )
      ) {

        try {

          const result =
            finishVote(
              groupId,
            );

          return {
            handled: true,
            message:
              finishPrompt(
                result,
              ),
          };

        } catch (error) {

          return {
            handled: true,
            message:
              error instanceof Error
                ? error.message
                : '結束投票失敗。',
          };
        }
      }


      const voteInput =
        parseExplicitVoteInput(
          vote,
          text,
        );


      if (
        !voteInput
      ) {

        /**
         * This is deliberately NOT marked as handled.
         *
         * Example:
         * 「我不想吃火鍋」
         *
         * should continue into normal AI,
         * rather than becoming a vote.
         */
        return {
          handled: false,
        };
      }


      try {

        const castResult =
          castVote(
            groupId,
            userId,
            voteInput,
          );


        if (
          castResult.finishResult
        ) {

          return {
            handled: true,
            message:
              finishPrompt(
                castResult.finishResult,
              ),
          };
        }


        if (
          castResult.changed
        ) {

          return {
            handled: true,
            message:
              `已改投「${castResult.option.text}」。`,
          };
        }


        return {
          handled: true,
          message:
            `已投「${castResult.option.text}」。`,
        };

      } catch (error) {

        return {
          handled: true,
          message:
            error instanceof Error
              ? error.message
              : '投票失敗。',
        };
      }
    }


    /**
     * -------------------------------------------------------
     * TIE
     * -------------------------------------------------------
     */
    if (
      vote.status ===
      'TIE'
    ) {

      if (
        isTieRevoteCommand(
          text,
        )
      ) {

        const updated =
          resolveVoteTie(
            groupId,
            'REVOTE_TIED',
          );

        return {
          handled: true,
          message:
            activePrompt(
              updated,
            ),
        };
      }


      if (
        isTieAddOptionsCommand(
          text,
        )
      ) {

        const updated =
          resolveVoteTie(
            groupId,
            'ADD_OPTIONS',
          );

        return {
          handled: true,
          message:
            [
              '已保留平手項目。',
              '',
              optionsPrompt(),
            ].join('\n'),
        };
      }


      return {
        handled: true,
        message:
          tiePrompt(
            vote,
          ),
      };
    }


    return {
      handled: false,
    };
  }


  /**
   * =======================================================
   * No active vote.
   * Only explicit vote-start intent may enter here.
   * =======================================================
   */
  if (
    !hasRequiredVoteInvocation(
      text,
    )
    ||
    !hasVoteStartIntent(
      text,
    )
  ) {

    return {
      handled: false,
    };
  }


  const title =
    parseVoteTitle(
      text,
    );


  if (!title) {

    return {
      handled: true,
      message:
        [
          '可以先告訴我這次要決定什麼。',
          '例如：投票決定晚餐吃什麼。',
        ].join('\n'),
    };
  }


  /**
   * Supplied options in the same message.
   * Examples:
   * 投票決定晚餐吃什麼：火鍋、燒肉、牛肉麵
   */
  const inlineOptions =
    parseInlineOptions(
      text,
    );

  const multilineOptions =
    parseMultilineOptions(
      text,
    );

  const suppliedOptions =
    inlineOptions.length >= 2
      ? inlineOptions
      : multilineOptions;


  try {

    return await beginNewVote(
      groupId,
      userId,
      title,
      suppliedOptions,
      options,
    );

  } catch (error) {

    return {
      handled: true,
      message:
        error instanceof Error
          ? error.message
          : '建立投票失敗。',
    };
  }
}