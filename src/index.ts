async function generateProactiveReply(
  type:
    | 'good-night'
    | 'silence',
): Promise<string> {

  if (
    type === 'good-night'
  ) {

    return buildStyleResponse(
      '諸位，夜深了，奴才先向各位道一聲晚安。' +
      '若還有什麼吩咐，隨時喚奴才一聲便是。',
    );

  }

  const response =
    await gemini.models.generateContent(
      {
        model:
          'gemini-3.5-flash-lite',

        contents: `
你現在是這個家庭的「大內總管」。

目前家庭群組已經連續一段時間沒有人說話。

你現在要主動打破冷清。

請只說一句自然、簡短、有總管性格的話。

可以像是在宮門口主動探頭看看眾人是否還醒著，
可以帶一點幽默、關心或宮廷感。

不要提到：

- 系統
- 排程
- 冷場
- 三小時
- 監控
- 程式
- AI

不要說自己需要休息或要下線。

不要假裝有人剛剛叫你。

直接輸出要在家庭群組中說的那一句話。
        `.trim(),

        config: {
          systemInstruction:
            SYSTEM_INSTRUCTION,
        },
      },
    );

  return (
    response.text?.trim() ||
    buildStyleResponse('諸位都如此安靜，奴才倒有些不習慣了。')
  );

}
