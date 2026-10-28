import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

const OWNER_MARKER = /return \[[^\]]*\]; \/\/ OWNER_UIDS/;
const withOwners = (rules: string, uids: string[]) =>
  rules.replace(OWNER_MARKER, `return [${uids.map((u) => `'${u}'`).join(', ')}]; // OWNER_UIDS`);
// 実際の firestore.rules を使い、所有者リストだけテスト用に差し替える（既定は未限定）
const SOURCE_RULES = readFileSync('firestore.rules', 'utf8');
const RULES = withOwners(SOURCE_RULES, []);
const PROJECT_ID = 'demo-jotbound';

let env: RulesTestEnvironment;

const db = (ctx: RulesTestContext) => ctx.firestore() as unknown as Firestore;
const alice = () => db(env.authenticatedContext('alice'));
const bob = () => db(env.authenticatedContext('bob'));
const anon = () => db(env.unauthenticatedContext());

const book = (over: Record<string, unknown> = {}) => ({
  title: '静かな読書の技法',
  titleNormalized: '静かな読書の技法',
  aliases: [],
  authors: ['霧島透'],
  isbn13: '9784535563956',
  publisher: null,
  coverUrl: null,
  coverProvider: 'none',
  externalSourceId: null,
  readingStatus: 'reading',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
});

const note = (over: Record<string, unknown> = {}) => ({
  bookId: 'b1',
  pageStart: 70,
  pageEnd: null,
  quote: '読みかけの本のほうが、考えを遠くまで運んでくれる',
  comment: '次の授業の参考にしたい。',
  transcript: null,
  topicTagIds: ['t1'],
  usageTagIds: [],
  usageStatus: 'planned',
  inputMethod: 'voice',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  schemaVersion: 1,
  ...over,
});

const tag = (over: Record<string, unknown> = {}) => ({
  name: '教育',
  normalizedName: '教育',
  category: 'topic',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
});

const profile = (over: Record<string, unknown> = {}) => ({
  preferredModel: 'gemini-3.5-flash-lite',
  preferredBookId: null,
  schemaVersion: 1,
  updatedAt: serverTimestamp(),
  ...over,
});

/** Rules を通さずに初期データを置く */
async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(db(ctx), path), { ...data, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: RULES } });
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
});

describe('所有者分離', () => {
  it('未認証ユーザーは読み書きできない', async () => {
    await seed('users/alice/books/b1', book());
    await assertFails(getDoc(doc(anon(), 'users/alice/books/b1')));
    await assertFails(setDoc(doc(anon(), 'users/alice/books/b2'), book()));
    await assertFails(getDocs(collection(anon(), 'users/alice/notes')));
  });

  it('本人は自分の書籍を作成・取得・一覧・更新・削除できる', async () => {
    const ref = doc(alice(), 'users/alice/books/b1');
    await assertSucceeds(setDoc(ref, book()));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/books')));
    await assertSucceeds(updateDoc(ref, { readingStatus: 'finished', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('別UIDは他人のデータを読めない・書けない・削除できない', async () => {
    await seed('users/alice/books/b1', book());
    await assertFails(getDoc(doc(bob(), 'users/alice/books/b1')));
    await assertFails(getDocs(collection(bob(), 'users/alice/books')));
    await assertFails(setDoc(doc(bob(), 'users/alice/books/b2'), book()));
    await assertFails(updateDoc(doc(bob(), 'users/alice/books/b1'), { readingStatus: 'unread', updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(bob(), 'users/alice/books/b1')));
  });

  it('定義外のパスは本人でも拒否（デフォルト拒否）', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { a: 1 }));
    await assertFails(getDoc(doc(alice(), 'users/alice')));
    await assertFails(setDoc(doc(alice(), 'users/alice/other/x'), { a: 1 }));
    await assertFails(setDoc(doc(alice(), 'config/global'), { a: 1 }));
  });
});

describe('所有者UIDの限定（owner:set）', () => {
  let ownerEnv: RulesTestEnvironment;
  beforeAll(async () => {
    const rules = withOwners(SOURCE_RULES, ['alice']);
    ownerEnv = await initializeTestEnvironment({ projectId: `${PROJECT_ID}-owner`, firestore: { rules } });
  });
  afterAll(async () => {
    await ownerEnv.cleanup();
  });

  it('許可された所有者だけが自分の領域を使える', async () => {
    const a = db(ownerEnv.authenticatedContext('alice'));
    const b = db(ownerEnv.authenticatedContext('bob'));
    await assertSucceeds(setDoc(doc(a, 'users/alice/settings/profile'), profile()));
    // 新規アカウントを作られても、自分のパスであっても使えない
    await assertFails(setDoc(doc(b, 'users/bob/settings/profile'), profile()));
    await assertFails(getDoc(doc(b, 'users/bob/settings/profile')));
  });
});

describe('books の検証', () => {
  let seq = 0;
  // 毎回新しい文書IDで作成（既存文書への set は update 扱いになるため）
  const create = (data: Record<string, unknown>) => setDoc(doc(alice(), `users/alice/books/b${++seq}`), data);

  it('許可されていないフィールド・欠落フィールドを拒否', async () => {
    await assertFails(create(book({ extra: true })));
    const { publisher: _omit, ...missing } = book();
    await assertFails(create(missing));
  });

  it('書名は1〜200文字・空白のみ不可', async () => {
    await assertFails(create(book({ title: '' })));
    await assertFails(create(book({ title: '   ' })));
    await assertFails(create(book({ title: 'あ'.repeat(201) })));
    await assertSucceeds(create(book({ title: 'あ'.repeat(200) })));
  });

  it('ISBN-13 形式・列挙値を検証', async () => {
    await assertFails(create(book({ isbn13: '4535563956' })));
    await assertFails(create(book({ isbn13: 9784535563956 })));
    await assertFails(create(book({ readingStatus: 'paused' })));
    await assertFails(create(book({ authors: 'one author' })));
  });

  it('書影URLは信頼できる提供元の https のみ', async () => {
    await assertSucceeds(create(book({ coverProvider: 'google', coverUrl: 'https://books.google.com/books/content?id=x&img=1' })));
    await assertSucceeds(create(book({ coverProvider: 'openlibrary', coverUrl: 'https://covers.openlibrary.org/b/isbn/9784535563956-M.jpg' })));
    await assertFails(create(book({ coverProvider: 'google', coverUrl: 'https://evil.example.com/books.google.com/x' })));
    await assertFails(create(book({ coverProvider: 'google', coverUrl: 'http://books.google.com/x' })));
    await assertFails(create(book({ coverProvider: 'none', coverUrl: 'https://covers.openlibrary.org/x' })));
    await assertFails(create(book({ coverProvider: 'manual', coverUrl: 'javascript:alert(1)' })));
    await assertFails(create(book({ coverProvider: 'manual', coverUrl: 'https://tracker.example.com/pixel.png' })));
    await assertFails(create(book({ coverProvider: 'google', coverUrl: null })));
  });

  it('updatedAt はサーバー時刻必須、createdAt は更新で変更不可', async () => {
    await assertFails(create(book({ updatedAt: Timestamp.fromDate(new Date('2020-01-01')) })));
    await assertFails(create(book({ createdAt: Timestamp.fromDate(new Date('2999-01-01')) })));
    // JSON 復元のため過去の createdAt は許可
    await assertSucceeds(create(book({ createdAt: Timestamp.fromDate(new Date('2024-01-01')) })));
    await seed('users/alice/books/fixed', book());
    await assertFails(
      updateDoc(doc(alice(), 'users/alice/books/fixed'), { createdAt: Timestamp.now(), updatedAt: serverTimestamp() }),
    );
  });
});

describe('notes の検証', () => {
  const create = (data: Record<string, unknown>, id = 'n1') => setDoc(doc(alice(), `users/alice/notes/${id}`), data);
  beforeEach(async () => {
    await seed('users/alice/books/b1', book());
  });

  it('要件定義書の抽出例どおりのメモを保存できる', async () => {
    await assertSucceeds(create(note()));
  });

  it('同じユーザーの登録済み書籍が必要（他人の本・未登録の本は不可）', async () => {
    await seed('users/bob/books/b9', book());
    await assertFails(create(note({ bookId: 'nope' })));
    await assertFails(create(note({ bookId: 'b9' })));
    await assertFails(create(note({ bookId: '' })));
  });

  it('JSON 復元: 本を先にコミットすれば、過去の作成日時のメモを書ける。更新は作成日時を残せば通る', async () => {
    const a = alice();
    const past = Timestamp.fromDate(new Date('2025-04-01'));
    // 同じバッチ内の本は exists() から見えないため、本 → メモの順に別々にコミットする
    const same = writeBatch(a);
    same.set(doc(a, 'users/alice/books/imp'), book({ createdAt: past }));
    same.set(doc(a, 'users/alice/notes/imp1'), note({ bookId: 'imp', createdAt: past }));
    await assertFails(same.commit());

    const books = writeBatch(a);
    books.set(doc(a, 'users/alice/books/imp'), book({ createdAt: past }));
    await assertSucceeds(books.commit());
    const notes = writeBatch(a);
    notes.set(doc(a, 'users/alice/notes/imp1'), note({ bookId: 'imp', createdAt: past }));
    await assertSucceeds(notes.commit());

    const update = writeBatch(a);
    update.update(doc(a, 'users/alice/notes/imp1'), { comment: '上書き', updatedAt: serverTimestamp() });
    await assertSucceeds(update.commit());
  });

  it('引用だけ・コメントだけは保存可、両方空は不可', async () => {
    await assertSucceeds(create(note({ comment: '' }), 'q'));
    await assertSucceeds(create(note({ quote: '' }), 'c'));
    await assertFails(create(note({ quote: '', comment: '' }), 'e'));
    await assertFails(create(note({ quote: ' \n', comment: '　 ' }), 'w'));
  });

  it('ページは1以上の整数、範囲は終了 >= 開始', async () => {
    await assertSucceeds(create(note({ pageStart: null, pageEnd: null }), 'p0'));
    await assertSucceeds(create(note({ pageStart: 70, pageEnd: 72 }), 'p1'));
    await assertFails(create(note({ pageStart: 0 }), 'p2'));
    await assertFails(create(note({ pageStart: 70.5 }), 'p3'));
    await assertFails(create(note({ pageStart: 72, pageEnd: 70 }), 'p4'));
    await assertFails(create(note({ pageStart: null, pageEnd: 70 }), 'p5'));
    await assertFails(create(note({ pageStart: '70' }), 'p6'));
  });

  it('文字数・タグ数・列挙値・schemaVersion を検証', async () => {
    await assertFails(create(note({ quote: 'あ'.repeat(5001) })));
    await assertFails(create(note({ transcript: 'あ'.repeat(20001) })));
    await assertFails(create(note({ topicTagIds: Array.from({ length: 11 }, (_, i) => `t${i}`) })));
    await assertFails(create(note({ topicTagIds: ['t1', 't1'] })));
    await assertFails(create(note({ usageStatus: 'done' })));
    await assertFails(create(note({ inputMethod: 'image' })));
    await assertFails(create(note({ schemaVersion: 2 })));
    await assertFails(create(note({ audio: 'base64...' })));
  });

  it('同じ noteId への再送は createdAt を保てば更新として成功する（冪等保存）', async () => {
    await assertSucceeds(create(note()));
    const existing = await getDoc(doc(alice(), 'users/alice/notes/n1'));
    await assertSucceeds(create(note({ createdAt: existing.data()!.createdAt })));
  });
});

describe('tags / settings の検証', () => {
  it('タグは名前1〜50文字・カテゴリは topic/usage', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/tags/t1'), tag()));
    await assertFails(setDoc(doc(alice(), 'users/alice/tags/t2'), tag({ category: 'project' })));
    await assertFails(setDoc(doc(alice(), 'users/alice/tags/t3'), tag({ name: 'あ'.repeat(51) })));
    await assertFails(setDoc(doc(alice(), 'users/alice/tags/t4'), tag({ name: '' })));
  });

  it('プロフィールは settings/profile のみ・モデルは gemini-3.5-flash-lite 固定', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/settings/profile'), profile()));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/settings/profile')));
    await assertFails(setDoc(doc(alice(), 'users/alice/settings/other'), profile()));
    await assertFails(setDoc(doc(alice(), 'users/alice/settings/profile'), profile({ preferredModel: 'gemini-3.5-pro' })));
    await assertFails(setDoc(doc(alice(), 'users/alice/settings/profile'), profile({ apiKey: 'secret' })));
    await assertFails(getDocs(collection(alice(), 'users/alice/settings')));
    await assertFails(deleteDoc(doc(alice(), 'users/alice/settings/profile')));
  });
});
