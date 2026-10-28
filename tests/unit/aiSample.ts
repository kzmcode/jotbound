/** 要件定義書 FR-AI の抽出例 */
export const sampleResponse = {
  transcript:
    '静かな読書の技法の70ページ、読みかけの本のほうが、考えを遠くまで運んでくれる。という記述を次の授業の参考にしたい。',
  bookMention: '静かな読書の技法',
  pageStart: 70,
  pageEnd: null,
  quote: '読みかけの本のほうが、考えを遠くまで運んでくれる',
  comment: '次の授業の参考にしたい。',
  topicTagCandidates: ['教育'],
  usageTagCandidates: ['授業'],
  usageStatus: 'planned' as const,
  warnings: [],
  multipleMemoDetected: false,
};
