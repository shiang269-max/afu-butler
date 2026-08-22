/**
 * =========================================================
 * Vote System
 * =========================================================
 *
 * 總管 6.0 投票系統核心。
 *
 * 本檔案只負責：
 *
 * - 投票流程狀態
 * - 群組隔離
 * - 投票題目
 * - 選項來源
 * - 參與人數
 * - 候選項目管理
 * - 正式投票
 * - 一人一票
 * - 重複投票
 * - 改票
 * - 自動完成判斷
 * - 手動完成
 * - 平手判斷
 * - 平手後重新投票
 * - 取消投票
 *
 * 不負責：
 *
 * - LINE Reply
 * - Mention
 * - AI
 * - 人格
 * - 說話風格
 * - 宮廷稱呼
 * - 回覆文案
 *
 * 本檔案只管理真實投票狀態與結構化結果。
 * =========================================================
 */


/**
 * =========================================================
 * 投票狀態
 * =========================================================
 */

export type VoteStatus =

  /**
   * 剛發起投票。
   *
   * 等待決定：
   *
   * - 選項由誰提供
   * - 有多少人參與
   */
  | 'SETUP'

  /**
   * 正在收集候選項目。
   */
  | 'COLLECTING_OPTIONS'

  /**
   * 候選項目已經準備完成。
   *
   * 尚未正式開始投票。
   */
  | 'READY'

  /**
   * 正式投票中。
   */
  | 'ACTIVE'

  /**
   * 投票結束。
   */
  | 'FINISHED'

  /**
   * 平手。
   *
   * 等待決定：
   *
   * - 平手項目再次投票
   * - 保留平手項目並加入新選項
   */
  | 'TIE'

  /**
   * 投票取消。
   */
  | 'CANCELLED';


/**
 * =========================================================
 * 選項來源
 * =========================================================
 */

export type VoteOptionSource =

  /**
   * 家庭成員提供。
   */
  | 'MEMBERS'

  /**
   * 總管／AI 協助提供。
   */
  | 'AI';


/**
 * =========================================================
 * 平手處理方式
 * =========================================================
 */

export type TieResolution =

  /**
   * 只針對平手項目重新投票。
   */
  | 'REVOTE_TIED'

  /**
   * 保留平手項目，
   * 再加入新的候選項目。
   */
  | 'ADD_OPTIONS';


/**
 * =========================================================
 * 投票選項
 * =========================================================
 */

export interface VoteOption {

  id: string;

  text: string;

}


/**
 * =========================================================
 * 個人投票紀錄
 * =========================================================
 */

export interface VoteRecord {

  optionId: string;

  votedAt: number;

}


/**
 * =========================================================
 * 投票主體
 * =========================================================
 */

export interface Vote {

  id: string;

  groupId: string;

  title: string;

  createdBy: string;

  createdAt: number;

  status: VoteStatus;

  /**
   * 本次參與投票的人數。
   *
   * 不寫死家庭成員數量。
   */
  expectedVoterCount: number | null;

  /**
   * 選項由誰提供。
   */
  optionSource: VoteOptionSource | null;

  /**
   * 候選選項。
   */
  options: VoteOption[];

  /**
   * 正式投票紀錄。
   *
   * key = userId
   */
  votes: Record<
    string,
    VoteRecord
  >;

  /**
   * 平手時的勝出選項 ID。
   */
  tiedOptionIds: string[];

  /**
   * 最後平手處理方式。
   */
  tieResolution: TieResolution | null;

  finishedAt?: number;

  cancelledAt?: number;

}


/**
 * =========================================================
 * 發起投票輸入
 * =========================================================
 */

export interface StartVoteInput {

  groupId: string;

  title: string;

  createdBy: string;

}


/**
 * =========================================================
 * 建立完整投票輸入
 *
 * 保留這個 API，
 * 方便程式直接建立已完成設定的投票。
 * =========================================================
 */

export interface CreateVoteInput {

  groupId: string;

  title: string;

  options: string[];

  createdBy: string;

  expectedVoterCount?: number;

  optionSource?: VoteOptionSource;

}


/**
 * =========================================================
 * 設定選項來源輸入
 * =========================================================
 */

export interface SetVoteOptionSourceInput {

  groupId: string;

  optionSource: VoteOptionSource;

}


/**
 * =========================================================
 * 設定參與人數輸入
 * =========================================================
 */

export interface SetExpectedVoterCountInput {

  groupId: string;

  expectedVoterCount: number;

}


/**
 * =========================================================
 * 投票統計
 * =========================================================
 */

export interface VoteOptionResult {

  optionId: string;

  text: string;

  votes: number;

}


/**
 * =========================================================
 * 投票結果
 * =========================================================
 */

export interface VoteResult {

  voteId: string;

  title: string;

  status: VoteStatus;

  expectedVoterCount: number | null;

  totalVotes: number;

  remainingVotes: number | null;

  results: VoteOptionResult[];

  winners: VoteOptionResult[];

  isTie: boolean;

  isEmpty: boolean;

  isComplete: boolean;

}


/**
 * =========================================================
 * 投票結果狀態
 * =========================================================
 */

export type VoteFinishState =

  | 'WINNER'

  | 'TIE'

  | 'EMPTY';


/**
 * =========================================================
 * 結束投票結果
 * =========================================================
 */

export interface FinishVoteResult {

  state: VoteFinishState;

  vote: Vote;

  result: VoteResult;

}


/**
 * =========================================================
 * 投票結果 Map
 * =========================================================
 */

export interface CastVoteResult {

  changed: boolean;

  previousOption:
    | VoteOption
    | null;

  option: VoteOption;

  vote: Vote;

  /**
   * 本次投票後，
   * 是否已達到預期投票人數。
   */
  isComplete: boolean;

  /**
   * 如果自動完成，
   * 會直接帶回結束結果。
   */
  finishResult:
    | FinishVoteResult
    | null;

}


/**
 * =========================================================
 * 群組進行中投票
 * =========================================================
 *
 * 包含：
 *
 * - SETUP
 * - COLLECTING_OPTIONS
 * - READY
 * - ACTIVE
 * - TIE
 *
 * FINISHED / CANCELLED
 * 會移至 history。
 * =========================================================
 */

const activeVotes =
  new Map<
    string,
    Vote
  >();


/**
 * =========================================================
 * 投票歷史
 * =========================================================
 */

const voteHistory =
  new Map<
    string,
    Vote
  >();


/**
 * =========================================================
 * 建立 Vote ID
 * =========================================================
 */

function createVoteId(): string {

  return `vote_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

}


/**
 * =========================================================
 * 正規化文字
 * =========================================================
 */

function normalizeText(
  text: string,
): string {

  return text
    .trim()
    .replace(/\s+/g, ' ');

}


/**
 * =========================================================
 * 正規化選項
 * =========================================================
 */

function normalizeOptionText(
  text: string,
): string {

  return normalizeText(
    text,
  );

}


/**
 * =========================================================
 * 建立 Vote Option
 * =========================================================
 */

function createVoteOptions(
  options: string[],
): VoteOption[] {

  const uniqueOptionMap =
    new Map<
      string,
      string
    >();


  for (
    const rawOption
    of options
  ) {

    const option =
      normalizeOptionText(
        rawOption,
      );


    if (!option) {

      continue;

    }


    const key =
      option.toLowerCase();


    if (
      !uniqueOptionMap.has(
        key,
      )
    ) {

      uniqueOptionMap.set(
        key,
        option,
      );

    }

  }


  return Array
    .from(
      uniqueOptionMap.values(),
    )
    .map(
      (
        text,
        index,
      ) => ({

        id:
          `option-${index + 1}`,

        text,

      }),
    );

}


/**
 * =========================================================
 * 取得群組進行中 Vote
 * =========================================================
 */

export function getActiveVote(
  groupId: string,
): Vote | null {

  return (
    activeVotes.get(
      groupId,
    )
    ||
    null
  );

}


/**
 * =========================================================
 * 取得歷史 Vote
 * =========================================================
 */

export function getVoteById(
  voteId: string,
): Vote | null {

  return (
    voteHistory.get(
      voteId,
    )
    ||
    null
  );

}


/**
 * =========================================================
 * 發起投票
 * =========================================================
 *
 * 流程起點：
 *
 * SETUP
 * =========================================================
 */

export function startVote(
  input: StartVoteInput,
): Vote {

  const {
    groupId,
    title,
    createdBy,
  } = input;


  const normalizedTitle =
    normalizeText(
      title,
    );


  if (!normalizedTitle) {

    throw new Error(
      '投票題目不能為空。',
    );

  }


  const existingVote =
    getActiveVote(
      groupId,
    );


  if (existingVote) {

    throw new Error(
      '目前已有進行中的投票。',
    );

  }


  const now =
    Date.now();


  const vote: Vote = {

    id:
      createVoteId(),

    groupId,

    title:
      normalizedTitle,

    createdBy,

    createdAt:
      now,

    status:
      'SETUP',

    expectedVoterCount:
      null,

    optionSource:
      null,

    options:
      [],

    votes:
      {},

    tiedOptionIds:
      [],

    tieResolution:
      null,

  };


  activeVotes.set(
    groupId,
    vote,
  );


  return vote;

}


/**
 * =========================================================
 * 建立完整 Vote
 * =========================================================
 *
 * 適合：
 *
 * - 已經有選項
 * - 已知參與人數
 * - 測試
 * - 未來程式直接建立
 *
 * 建立後狀態為：
 *
 * ACTIVE
 * =========================================================
 */

export function createVote(
  input: CreateVoteInput,
): Vote {

  const {
    groupId,
    title,
    options,
    createdBy,
    expectedVoterCount,
    optionSource,
  } = input;


  const vote =
    startVote({

      groupId,

      title,

      createdBy,

    });


  if (
    expectedVoterCount !==
    undefined
  ) {

    setExpectedVoterCount({

      groupId,

      expectedVoterCount,

    });

  }


  setVoteOptionSource({

    groupId,

    optionSource:
      optionSource
      ||
      'MEMBERS',

  });


  addVoteOptions(
    groupId,
    options,
  );


  startVoting(
    groupId,
  );


  return vote;

}


/**
 * =========================================================
 * 設定選項來源
 * =========================================================
 */

export function setVoteOptionSource(
  input: SetVoteOptionSourceInput,
): Vote {

  const {
    groupId,
    optionSource,
  } = input;


  const vote =
    getActiveVote(
      groupId,
    );


  if (!vote) {

    throw new Error(
      '目前沒有進行中的投票。',
    );

  }


  if (
    vote.status !==
    'SETUP'
  ) {

    throw new Error(
      '目前無法變更選項來源。',
    );

  }


  vote.optionSource =
    optionSource;


  vote.status =
    'COLLECTING_OPTIONS';


  return vote;

}


/**
 * =========================================================
 * 設定預期投票人數
 * =========================================================
 */

export function setExpectedVoterCount(
  input: SetExpectedVoterCountInput,
): Vote {

  const {
    groupId,
    expectedVoterCount,
  } = input;


  const vote =
    getActiveVote(
      groupId,
    );


  if (!vote) {

    throw new Error(
      '目前沒有進行中的投票。',
    );

  }


  if (
    vote.status ===
    'ACTIVE'
  ) {

    throw new Error(
      '投票開始後無法變更參與人數。',
    );

  }


  if (
    vote.status ===
    'FINISHED'
    ||
    vote.status ===
    'CANCELLED'
  ) {

    throw new Error(
      '這場投票已經結束。',
    );

  }


  if (
    !Number.isInteger(
      expectedVoterCount,
    )
    ||
    expectedVoterCount < 1
  ) {

    throw new Error(
      '參與投票人數必須至少為 1。',
    );

  }


  vote.expectedVoterCount =
    expectedVoterCount;


  return vote;

}


/**
 * =========================================================
 * 新增候選項目
 * =========================================================
 *
 * 只能在：
 *
 * - COLLECTING_OPTIONS
 * - READY
 *
 * 投票開始後不能再新增。
 * =========================================================
 */

export function addVoteOptions(
  groupId: string,
  options: string[],
): Vote {

  const vote =
    getActiveVote(
      groupId,
    );


  if (!vote) {

    throw new Error(
      '目前沒有進行中的投票。',
    );

  }


  if (
    vote.status !==
    'COLLECTING_OPTIONS'
    &&
    vote.status !==
    'READY'
  ) {

    throw new Error(
      '目前無法新增候選項目。',
    );

  }


  const existingKeys =
    new Set(
      vote.options.map(
        (option) =>
          option.text
            .toLowerCase(),
      ),
    );


  for (
    const rawOption
    of options
  ) {

    const text =
      normalizeOptionText(
        rawOption,
      );


    if (!text) {

      continue;

    }


    const key =
      text.toLowerCase();


    if (
      existingKeys.has(
        key,
      )
    ) {

      continue;

    }


    vote.options.push({

      id:
        `option-${vote.options.length + 1}`,

      text,

    });


    existingKeys.add(
      key,
    );

  }


  if (
    vote.options.length >= 2
  ) {

    vote.status =
      'READY';

  }


  return vote;

}


/**
 * =========================================================
 * 移除候選項目
 * =========================================================
 *
 * 只能在正式投票開始前。
 * =========================================================
 */

export function removeVoteOption(
  groupId: string,
  optionInput: string,
): Vote {

  const vote =
    getActiveVote(
      groupId,
    );


  if (!vote) {

    throw new Error(
      '目前沒有進行中的投票。',
    );

  }


  if (
    vote.status !==
    'COLLECTING_OPTIONS'
    &&
    vote.status !==
    'READY'
  ) {

    throw new Error(
      '投票開始後無法修改候選項目。',
    );

  }


  const option =
    findVoteOption(
      vote,
      optionInput,
    );


  if (!option) {

    throw new Error(
      '找不到這個候選項目。',
    );

  }


  vote.options =
    vote.options.filter(
      (item) =>
        item.id !==
        option.id,
    );


  if (
    vote.options.length < 2
  ) {

    vote.status =
      'COLLECTING_OPTIONS';

  }


  return vote;

}


/**
 * =========================================================
 * 尋找選項
 * =========================================================
 *
 * 支援：
 *
 * - option-1
 * - 1
 * - 火鍋
 * =========================================================
 */

export function findVoteOption(
  vote: Vote,
  input: string,
): VoteOption | null {

  const normalizedInput =
    normalizeText(
      input,
    );


  if (!normalizedInput) {

    return null;

  }


  const directIdMatch =
    vote.options.find(
      (option) =>
        option.id ===
        normalizedInput,
    );


  if (directIdMatch) {

    return directIdMatch;

  }


  if (
    /^\d+$/.test(
      normalizedInput,
    )
  ) {

    const number =
      Number(
        normalizedInput,
      );


    if (
      number >= 1
      &&
      number <=
      vote.options.length
    ) {

      return (
        vote.options[
          number - 1
        ]
        ||
        null
      );

    }

  }


  const normalizedLower =
    normalizedInput
      .toLowerCase();


  return (
    vote.options.find(
      (option) =>
        option.text
          .toLowerCase()
        ===
        normalizedLower,
    )
    ||
    null
  );

}


/**
 * =========================================================
 * 開始正式投票
 * =========================================================
 *
 * 必須：
 *
 * - 至少兩個選項
 * - 已設定參與人數
 *
 * READY
 * ↓
 * ACTIVE
 * =========================================================
 */

export function startVoting(
  groupId: string,
): Vote {

  const vote =
    getActiveVote(
      groupId,
    );


  if (!vote) {

    throw new Error(
      '目前沒有進行中的投票。',
    );

  }


  if (
    vote.status !==
    'READY'
  ) {

    throw new Error(
      '目前尚未完成投票準備。',
    );

  }


  if (
    vote.options.length < 2
  ) {

    throw new Error(
      '投票至少需要兩個選項。',
    );

  }


  if (
    vote.expectedVoterCount ===
    null
  ) {

    throw new Error(
      '尚未設定參與投票人數。',
    );

  }


  vote.status =
    'ACTIVE';


  vote.votes =
    {};


  return vote;

}


/**
 * =========================================================
 * 投票
 *
 * 支援：
 *
 * - 新投票
 * - 重複投票
 * - 改票
 * - 自動完成
 * =========================================================
 */

export function castVote(
  groupId: string,
  userId: string,
  optionInput: string,
): CastVoteResult {

  const vote =
    getActiveVote(
      groupId,
    );


  if (!vote) {

    throw new Error(
      '目前沒有進行中的投票。',
    );

  }


  if (
    vote.status !==
    'ACTIVE'
  ) {

    throw new Error(
      '目前不是正式投票階段。',
    );

  }


  const option =
    findVoteOption(
      vote,
      optionInput,
    );


  if (!option) {

    throw new Error(
      '找不到這個投票選項。',
    );

  }


  const previousVote =
    vote.votes[
      userId
    ];


  if (
    previousVote
    &&
    previousVote.optionId ===
    option.id
  ) {

    return {

      changed:
        false,

      previousOption:
        option,

      option,

      vote,

      isComplete:
        isVoteComplete(
          vote,
        ),

      finishResult:
        null,

    };

  }


  const previousOption =
    previousVote
      ? (
          vote.options.find(
            (item) =>
              item.id ===
              previousVote.optionId,
          )
          ||
          null
        )
      : null;


  vote.votes[
    userId
  ] = {

    optionId:
      option.id,

    votedAt:
      Date.now(),

  };


  const isComplete =
    isVoteComplete(
      vote,
    );


  if (!isComplete) {

    return {

      changed:
        previousOption !==
        null,

      previousOption,

      option,

      vote,

      isComplete:
        false,

      finishResult:
        null,

    };

  }


  const finishResult =
    finishVote(
      groupId,
    );


  return {

    changed:
      previousOption !==
      null,

    previousOption,

    option,

    vote:
      finishResult.vote,

    isComplete:
      true,

    finishResult,

  };

}


/**
 * =========================================================
 * 是否已完成所有預期投票
 * =========================================================
 */

export function isVoteComplete(
  vote: Vote,
): boolean {

  if (
    vote.expectedVoterCount ===
    null
  ) {

    return false;

  }


  const totalVotes =
    Object.keys(
      vote.votes,
    ).length;


  return (
    totalVotes >=
    vote.expectedVoterCount
  );

}


/**
 * =========================================================
 * 取得投票統計
 * =========================================================
 */

export function getVoteResult(
  vote: Vote,
): VoteResult {

  const voteCounts =
    new Map<
      string,
      number
    >();


  for (
    const option
    of vote.options
  ) {

    voteCounts.set(
      option.id,
      0,
    );

  }


  for (
    const record
    of Object.values(
      vote.votes,
    )
  ) {

    const currentCount =
      voteCounts.get(
        record.optionId,
      )
      ||
      0;


    voteCounts.set(
      record.optionId,
      currentCount + 1,
    );

  }


  const results =
    vote.options.map(
      (option) => ({

        optionId:
          option.id,

        text:
          option.text,

        votes:
          voteCounts.get(
            option.id,
          )
          ||
          0,

      }),
    );


  const totalVotes =
    Object.keys(
      vote.votes,
    ).length;


  const remainingVotes =
    vote.expectedVoterCount ===
    null
      ? null
      : Math.max(
          0,
          vote.expectedVoterCount -
          totalVotes,
        );


  if (
    totalVotes === 0
  ) {

    return {

      voteId:
        vote.id,

      title:
        vote.title,

      status:
        vote.status,

      expectedVoterCount:
        vote.expectedVoterCount,

      totalVotes,

      remainingVotes,

      results,

      winners:
        [],

      isTie:
        false,

      isEmpty:
        true,

      isComplete:
        isVoteComplete(
          vote,
        ),

    };

  }


  const highestVotes =
    Math.max(
      ...results.map(
        (item) =>
          item.votes,
      ),
    );


  const winners =
    results.filter(
      (item) =>
        item.votes ===
        highestVotes,
    );


  return {

    voteId:
      vote.id,

    title:
      vote.title,

    status:
      vote.status,

    expectedVoterCount:
      vote.expectedVoterCount,

    totalVotes,

    remainingVotes,

    results,

    winners,

    isTie:
      winners.length > 1,

    isEmpty:
      false,

    isComplete:
      isVoteComplete(
        vote,
      ),

  };

}


/**
 * =========================================================
 * 以 groupId 取得結果
 * =========================================================
 */

export function getActiveVoteResult(
  groupId: string,
): VoteResult | null {

  const vote =
    getActiveVote(
      groupId,
    );


  if (!vote) {

    return null;

  }


  return getVoteResult(
    vote,
  );

}


/**
 * =========================================================
 * 結束投票
 *
 * 結果：
 *
 * - WINNER
 * - TIE
 * - EMPTY
 *
 * 如果平手：
 *
 * Vote 不會進入歷史，
 * 而是保留在 TIE 狀態，
 * 等待下一步決策。
 * =========================================================
 */

export function finishVote(
  groupId: string,
): FinishVoteResult {

  const vote =
    getActiveVote(
      groupId,
    );


  if (!vote) {

    throw new Error(
      '目前沒有進行中的投票。',
    );

  }


  if (
    vote.status !==
    'ACTIVE'
  ) {

    throw new Error(
      '目前無法結束投票。',
    );

  }


  const result =
    getVoteResult(
      vote,
    );


  if (result.isEmpty) {

    vote.status =
      'FINISHED';

    vote.finishedAt =
      Date.now();

    activeVotes.delete(
      groupId,
    );

    voteHistory.set(
      vote.id,
      vote,
    );


    return {

      state:
        'EMPTY',

      vote,

      result:
        getVoteResult(
          vote,
        ),

    };

  }


  if (result.isTie) {

    vote.status =
      'TIE';

    vote.tiedOptionIds =
      result.winners.map(
        (item) =>
          item.optionId,
      );


    return {

      state:
        'TIE',

      vote,

      result:
        getVoteResult(
          vote,
        ),

    };

  }


  vote.status =
    'FINISHED';

  vote.finishedAt =
    Date.now();


  activeVotes.delete(
    groupId,
  );


  voteHistory.set(
    vote.id,
    vote,
  );


  return {

    state:
      'WINNER',

    vote,

    result:
      getVoteResult(
        vote,
      ),

  };

}


/**
 * =========================================================
 * 解決平手
 * =========================================================
 *
 * TIE
 * ↓
 *
 * REVOTE_TIED
 *   只保留平手項目
 *
 * ADD_OPTIONS
 *   保留平手項目
 *   回到候選項目收集
 * =========================================================
 */

export function resolveVoteTie(
  groupId: string,
  resolution: TieResolution,
): Vote {

  const vote =
    getActiveVote(
      groupId,
    );


  if (!vote) {

    throw new Error(
      '目前沒有進行中的投票。',
    );

  }


  if (
    vote.status !==
    'TIE'
  ) {

    throw new Error(
      '目前沒有需要處理的平手結果。',
    );

  }


  const tiedOptions =
    vote.options.filter(
      (option) =>
        vote.tiedOptionIds.includes(
          option.id,
        ),
    );


  if (
    tiedOptions.length < 2
  ) {

    throw new Error(
      '找不到有效的平手選項。',
    );

  }


  vote.tieResolution =
    resolution;


  vote.votes =
    {};


  if (
    resolution ===
    'REVOTE_TIED'
  ) {

    vote.options =
      tiedOptions;


    vote.tiedOptionIds =
      [];


    vote.status =
      'ACTIVE';


    return vote;

  }


  vote.options =
    tiedOptions;


  vote.tiedOptionIds =
    [];


  vote.status =
    'COLLECTING_OPTIONS';


  return vote;

}


/**
 * =========================================================
 * 取消投票
 * =========================================================
 */

export function cancelVote(
  groupId: string,
): Vote {

  const vote =
    getActiveVote(
      groupId,
    );


  if (!vote) {

    throw new Error(
      '目前沒有進行中的投票。',
    );

  }


  vote.status =
    'CANCELLED';


  vote.cancelledAt =
    Date.now();


  activeVotes.delete(
    groupId,
  );


  voteHistory.set(
    vote.id,
    vote,
  );


  return vote;

}


/**
 * =========================================================
 * 清除所有 Vote State
 *
 * 僅供測試使用。
 * =========================================================
 */

export function clearVoteState(): void {

  activeVotes.clear();

  voteHistory.clear();

}