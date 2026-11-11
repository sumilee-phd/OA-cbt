/* 사무자동화산업기사 필기 CBT — 빌드 없는 정적 앱. 데이터는 data/bank.js(window.CBT_BANK). */
(() => {
  'use strict';

  const app = document.getElementById('app');
  const tools = document.getElementById('topbar-tools');
  const BANK = window.CBT_BANK;
  if (!BANK || !Array.isArray(BANK.questions)) {
    app.innerHTML = '<p class="empty">문제은행 파일(data/bank.js) 없음. 생성 스크립트 build_bank.py 실행 필요.</p>';
    return;
  }

  const STORE = 'oa-cbt-v1';
  const CIRCLED = ['①', '②', '③', '④'];
  const RULE = BANK.passRule;
  const Q = new Map(BANK.questions.map((q) => [q.id, q]));
  const ORDER = new Map(BANK.questions.map((q, i) => [q.id, i]));
  const EXAMS = BANK.exams;
  const CHAPTERS = BANK.chapters;
  const SUBJ = new Map(BANK.subjects.map((s) => [s.id, s.name]));
  const setTitle = (key) => (EXAMS.find((e) => e.id === key) || {}).title
    || ((c) => c ? `${c.no}장 대표 문제` : '오답 다시 풀기')(CHAPTERS.find((c) => c.id === key));

  /* ------------------------------------------------------------ 저장 */
  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { s = {}; }
    const st = { log: s.log || {}, results: s.results || {}, session: s.session || null };
    if (st.session && (!Array.isArray(st.session.ids) || st.session.ids.some((id) => !Q.has(id)))) st.session = null;
    for (const [k, r] of Object.entries(st.results)) if (!r || !Array.isArray(r.ids) || r.ids.some((id) => !Q.has(id))) delete st.results[k];
    for (const id of Object.keys(st.log)) if (!Q.has(id)) delete st.log[id];
    return st;
  }
  let state = load();
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch { /* 저장 공간 없음: 기록 없이 진행 */ } }

  /* 맞히면 오답 목록에서 제외, 틀리면 추가 (모든 모드 공통) */
  function record(id, choice) {
    const q = Q.get(id);
    const prev = state.log[id] || { tries: 0, wrong: 0 };
    const ok = choice === q.answer;
    state.log[id] = { tries: prev.tries + 1, wrong: prev.wrong + (ok ? 0 : 1), last: ok, at: Date.now() };
  }
  const wrongIds = () => Object.keys(state.log).filter((id) => state.log[id].last === false).sort((a, b) => ORDER.get(a) - ORDER.get(b));

  /* ------------------------------------------------------------ 표시 도구 */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  function blocks(list) {
    return list.map((b) => {
      if (b.t === 'code') return `<pre><code>${esc(b.text)}</code></pre>`;
      if (b.t === 'table') {
        const head = b.head.map((c) => `<th scope="col">${inline(c)}</th>`).join('');
        const rows = b.rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      return `<p>${inline(b.text)}</p>`;
    }).join('');
  }
  const two = (n) => String(n).padStart(2, '0');
  function clock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return `${Math.floor(sec / 3600)}:${two(Math.floor((sec % 3600) / 60))}:${two(sec % 60)}`;
  }
  function day(ts) { const d = new Date(ts); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; }
  function srcLabel(q) {
    return q.set.startsWith('m') ? `모의고사 ${q.set.slice(1)}회 ${two(q.number)}번` : `${q.chapter}장 대표 문제 ${two(q.number)}번`;
  }
  const subjLabel = (id) => `${id}과목 ${SUBJ.get(id)}`;

  /* ------------------------------------------------------------ 대화상자 */
  const modal = document.getElementById('modal');
  let modalResolve = null;
  function ask(title, text, okLabel = '확인', cancelLabel = '취소') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').textContent = text;
    document.getElementById('modal-ok').textContent = okLabel;
    const cancel = document.getElementById('modal-cancel');
    cancel.textContent = cancelLabel;
    cancel.hidden = cancelLabel === null;
    modal.hidden = false;
    document.getElementById('modal-ok').focus();
    return new Promise((resolve) => { modalResolve = resolve; });
  }
  function closeModal(value) {
    if (modal.hidden) return;
    modal.hidden = true;
    const r = modalResolve; modalResolve = null;
    if (r) r(value);
  }
  document.getElementById('modal-ok').addEventListener('click', () => closeModal(true));
  document.getElementById('modal-cancel').addEventListener('click', () => closeModal(false));
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(false); });

  /* ------------------------------------------------------------ 화면 상태 */
  let view = { name: 'home' };

  function render() {
    clearInterval(render.timer);
    if (view.name === 'quiz' && state.session) renderQuiz();
    else if (view.name === 'result' && state.results[view.key]) renderResult();
    else { view = { name: 'home' }; renderHome(); }
    if (state.session && state.session.mode === 'mock') {
      render.timer = setInterval(tick, 1000);
    }
  }

  function tick() {
    const s = state.session;
    if (!s || s.mode !== 'mock') return;
    const left = (s.deadline - Date.now()) / 1000;
    if (left <= 0) { finishMock(true); return; }
    const el = document.querySelector('[data-timer]');
    if (el) {
      el.textContent = clock(left);
      el.classList.toggle('warn', left <= 600);
    }
  }

  /* ------------------------------------------------------------ 홈 */
  function renderHome() {
    tools.innerHTML = '';
    const solved = Object.keys(state.log).length;
    const okCount = Object.values(state.log).filter((l) => l.last).length;
    const wrong = wrongIds();
    const s = state.session;

    let resume = '';
    if (s) {
      const answered = Object.keys(s.answers).length;
      const extra = s.mode === 'mock' ? ` · 남은 시간 <span data-timer>${clock((s.deadline - Date.now()) / 1000)}</span>` : '';
      resume = `<div class="card resume" role="status">
        <p><strong>진행 중: ${esc(s.title)}</strong> · 답안 ${answered} / ${s.ids.length}${extra}</p>
        <div><button data-act="abandon" class="danger">응시 취소</button> <button class="primary" data-act="resume">이어서 풀기</button></div>
      </div>`;
    }

    const examCards = EXAMS.map((e) => {
      const r = state.results[e.id];
      const last = r
        ? `<p class="last">최근 결과: <span class="tag ${r.pass ? '' : 'burgundy'}">${r.pass ? '합격' : '불합격'}</span> ${r.correct}문항 · 평균 ${(r.correct / e.questionIds.length * 100).toFixed(1)}점 · ${day(r.at)}</p>
           <button class="link" data-act="show-result" data-key="${e.id}">최근 결과·해설 보기</button>`
        : '<p class="last muted">응시 기록 없음</p>';
      return `<article class="card exam-card">
        <h3>${esc(e.title)}</h3>
        <p class="meta">${e.questionIds.length}문항 · ${e.minutes}분 · 과목당 ${RULE.perSubject}문항</p>
        ${last}
        <button class="primary" data-act="start" data-mode="mock" data-key="${e.id}">응시 시작</button>
      </article>`;
    }).join('');

    const chapterRows = CHAPTERS.map((c) => {
      const r = state.results[c.id];
      const last = r ? ` · 최근 ${r.correct}/${r.ids.length}` : '';
      return `<div class="card chapter-row">
        <span class="chapter-no">${c.no}장</span>
        <div><h3>${esc(c.title)}</h3><small>${subjLabel(c.subject)} · ${c.questionIds.length}문항${last}</small></div>
        <button data-act="start" data-mode="chapter" data-key="${c.id}">연습 시작</button>
      </div>`;
    }).join('');

    const bySubj = BANK.subjects.map((sub) => [sub.id, wrong.filter((id) => Q.get(id).subject === sub.id).length]);
    const chips = bySubj.map(([id, n]) => `<button data-act="start-wrong" data-subject="${id}" ${n ? '' : 'disabled'}>${id}과목 ${n}</button>`).join('');

    app.innerHTML = `
      <section class="card hero">
        <div>
          <h1>필기 3과목 · ${BANK.questions.length}문항</h1>
          <p>모의고사 ${EXAMS.length}회 ${EXAMS.reduce((a, e) => a + e.questionIds.length, 0)}문항, 2~8장 대표 문제 ${CHAPTERS.reduce((a, c) => a + c.questionIds.length, 0)}문항. 전 문항 해설과 책의 절·표 번호 수록.</p>
        </div>
        <div class="hero-stats">
          <div class="stat"><small>푼 문항</small><strong>${solved}</strong></div>
          <div class="stat"><small>최근 정답률</small><strong>${solved ? Math.round(okCount / solved * 100) : 0}%</strong></div>
          <div class="stat"><small>오답</small><strong>${wrong.length}</strong></div>
        </div>
      </section>
      ${resume}
      <section class="section" aria-labelledby="h-mock">
        <div class="section-head"><h2 id="h-mock">모의고사</h2><p>제한 시간 1시간 30분 · 제출 전 정답 비공개</p></div>
        <div class="exam-grid">${examCards}</div>
        <p class="rule">합격 기준: 과목별 ${RULE.perSubjectMin}문항(40점) 이상, 전체 ${RULE.totalMin}문항(평균 60점) 이상. 과목별 ${RULE.perSubjectMin}문항 미만은 과락.</p>
      </section>
      <section class="section" aria-labelledby="h-ch">
        <div class="section-head"><h2 id="h-ch">장별 연습</h2><p>2~8장 대표 문제 · 문항별 즉시 채점 · 시간 제한 없음</p></div>
        <div class="chapter-list">${chapterRows}</div>
      </section>
      <section class="section" aria-labelledby="h-wrong">
        <div class="section-head"><h2 id="h-wrong">오답 다시 풀기</h2><p>마지막 풀이가 오답인 문항 모음 · 정답 처리 시 목록에서 제외</p></div>
        <div class="card wrong-box">
          <div>
            <strong>오답 ${wrong.length}문항</strong>
            <div class="counts">${chips}</div>
          </div>
          <button class="primary" data-act="start-wrong" ${wrong.length ? '' : 'disabled'}>전체 오답 풀기</button>
        </div>
      </section>
      <div class="home-foot"><button class="danger" data-act="reset" ${solved || s || Object.keys(state.results).length ? '' : 'disabled'}>학습 기록 초기화</button></div>`;
  }

  /* ------------------------------------------------------------ 세션 시작 */
  async function start(mode, key, ids, title) {
    if (state.session) {
      const ok = await ask('진행 중인 풀이', `「${state.session.title}」 풀이 기록을 지우고 새로 시작합니다.`, '새로 시작');
      if (!ok) return;
    }
    const now = Date.now();
    const exam = EXAMS.find((e) => e.id === key);
    state.session = {
      mode, key, title, ids, index: 0, answers: {}, checked: {}, startedAt: now,
      deadline: mode === 'mock' ? now + exam.minutes * 60 * 1000 : null,
    };
    save();
    view = { name: 'quiz' };
    render();
    window.scrollTo({ top: 0 });
  }

  /* ------------------------------------------------------------ 문항 화면 */
  function choiceButtons(q, chosen, reveal, interactive) {
    return q.choices.map((c, i) => {
      const n = i + 1;
      const cls = ['choice'];
      let flag = '';
      if (reveal) {
        if (n === q.answer) { cls.push('correct'); flag = n === chosen ? '정답 · 선택' : '정답'; }
        else if (n === chosen) { cls.push('incorrect'); flag = '선택'; }
      } else if (n === chosen) cls.push('selected');
      const attrs = interactive && !reveal ? `data-act="choose" data-n="${n}"` : 'disabled';
      return `<button type="button" class="${cls.join(' ')}" ${attrs} aria-pressed="${n === chosen}">
        <span class="mark">${CIRCLED[i]}</span><span>${inline(c)}</span><span class="flag">${flag}</span></button>`;
    }).join('');
  }

  function feedback(q, chosen) {
    const ok = chosen === q.answer;
    const head = !chosen ? `미응답 · 정답 ${CIRCLED[q.answer - 1]}` : ok ? `정답 ${CIRCLED[q.answer - 1]}` : `오답 · 정답 ${CIRCLED[q.answer - 1]} · 선택 ${CIRCLED[chosen - 1]}`;
    return `<div class="feedback ${ok ? '' : 'bad'}">
      <strong>${head}</strong>
      <div class="explain">${blocks(q.explanation)}</div>
      <span class="ref">관련 절: ${esc(q.ref)}</span>
    </div>`;
  }

  function renderQuiz() {
    const s = state.session;
    const q = Q.get(s.ids[s.index]);
    const chosen = s.answers[q.id];
    const isMock = s.mode === 'mock';
    const checked = !isMock && !!s.checked[q.id];
    const answered = Object.keys(s.answers).length;
    const last = s.index === s.ids.length - 1;

    tools.innerHTML = (isMock ? `<span class="timer" data-timer aria-label="남은 시간">${clock((s.deadline - Date.now()) / 1000)}</span>` : '')
      + '<button data-act="home">홈으로</button>';

    const sub = isMock
      ? `${s.ids.length}문항 · 제한 ${EXAMS.find((e) => e.id === s.key).minutes}분 · 제출 전 정답 비공개 · 홈 화면에서도 시간 경과`
      : `${s.ids.length}문항 · 문항별 정답 확인 · 시간 제한 없음`;

    const prevBtn = `<button data-act="prev" ${s.index === 0 ? 'disabled' : ''}>이전</button>`;
    let right;
    let keys;
    if (isMock) {
      right = `<button class="primary" data-act="next" ${last ? 'disabled' : ''}>다음</button>`;
      keys = '단축키: 1~4 답 선택 · ← → 문항 이동';
    } else if (!checked) {
      right = `<button data-act="next" ${last ? 'disabled' : ''}>건너뛰기</button><button class="primary" data-act="check" ${chosen ? '' : 'disabled'}>정답 확인</button>`;
      keys = '단축키: 1~4 답 선택 · Enter 정답 확인 · ← → 문항 이동';
    } else {
      right = last
        ? '<button class="primary" data-act="finish">결과 보기</button>'
        : '<button class="primary" data-act="next">다음 문항</button>';
      keys = `단축키: Enter ${last ? '결과 보기' : '다음 문항'} · ← → 문항 이동`;
    }
    const action = `${checked ? feedback(q, chosen) : ''}
      <div class="q-bottom">${prevBtn}<div class="right">${right}</div></div>
      <p class="keys">${keys}</p>`;

    const navGroups = groupForNav(s).map((g) => `
      <p class="nav-sub">${esc(g.label)}</p>
      <div class="nav-grid">${g.items.map(({ id, i }) => {
        const cls = [];
        if (i === s.index) cls.push('current');
        if (isMock) { if (s.answers[id]) cls.push('answered'); }
        else if (s.checked[id]) cls.push(s.answers[id] === Q.get(id).answer ? 'ok' : 'ng');
        const label = isMock ? Q.get(id).number : i + 1;
        return `<button class="${cls.join(' ')}" data-act="jump" data-i="${i}" aria-label="${label}번${s.answers[id] ? ' 답안 있음' : ''}">${label}</button>`;
      }).join('')}</div>`).join('');

    const legend = isMock
      ? '<div class="nav-legend"><span class="l-ans">답안 있음</span><span>미응답</span></div>'
      : '<div class="nav-legend"><span class="l-ans">정답</span><span class="l-ng">오답</span><span>미확인</span></div>';
    const doneCount = isMock ? answered : Object.keys(s.checked).length;

    app.innerHTML = `
      <div class="quiz-head">
        <div><h1>${esc(s.title)}</h1><p>${sub}</p></div>
      </div>
      <div class="quiz-layout">
        <article class="card question" aria-labelledby="q-stem">
          <div class="q-top">
            <span class="tag">${subjLabel(q.subject)}</span>
            <span class="q-num">${isMock ? `${q.number} / ${s.ids.length}` : `${s.index + 1} / ${s.ids.length} · ${srcLabel(q)}`}</span>
          </div>
          <div class="stem" id="q-stem">${blocks(q.stem)}</div>
          <div class="choices" role="group" aria-label="보기">${choiceButtons(q, chosen, checked, true)}</div>
          ${action}
        </article>
        <aside class="card navigator" aria-label="문항 이동">
          <h2>${isMock ? '답안' : '확인'} ${doneCount} / ${s.ids.length}</h2>
          <div class="progress" aria-hidden="true"><span style="width:${doneCount / s.ids.length * 100}%"></span></div>
          ${navGroups}
          ${legend}
          ${isMock
            ? '<button class="primary" data-act="submit">답안 제출</button>'
            : '<button class="primary" data-act="finish">풀이 종료 · 결과 보기</button>'}
        </aside>
      </div>`;
  }

  function groupForNav(s) {
    const items = s.ids.map((id, i) => ({ id, i }));
    if (s.mode === 'mock') {
      return BANK.subjects.map((sub) => ({ label: `${subjLabel(sub.id)} (${items.filter(({ id }) => Q.get(id).subject === sub.id && s.answers[id]).length}/${items.filter(({ id }) => Q.get(id).subject === sub.id).length})`, items: items.filter(({ id }) => Q.get(id).subject === sub.id) }));
    }
    return [{ label: s.mode === 'chapter' ? '문항' : '오답 문항', items }];
  }

  function go(i) {
    const s = state.session;
    if (!s || i < 0 || i >= s.ids.length) return;
    s.index = i;
    save();
    render();
    const card = document.querySelector('.question');
    if (card && card.getBoundingClientRect().top < 60) window.scrollTo({ top: 0 });
  }

  /* ------------------------------------------------------------ 채점 */
  function finishMock(expired) {
    const s = state.session;
    if (!s) return;
    const per = BANK.subjects.map((sub) => ({ subject: sub.id, correct: 0, answered: 0, total: 0 }));
    let correct = 0;
    for (const id of s.ids) {
      const q = Q.get(id);
      const p = per[q.subject - 1];
      const a = s.answers[id];
      p.total += 1;
      if (a) { p.answered += 1; record(id, a); }
      if (a === q.answer) { p.correct += 1; correct += 1; }
    }
    const cut = per.filter((p) => p.correct < RULE.perSubjectMin);
    const end = Math.min(Date.now(), s.deadline);
    state.results[s.key] = {
      mode: 'mock', key: s.key, title: s.title, ids: s.ids, answers: { ...s.answers }, at: Date.now(),
      expired: !!expired, usedSec: Math.round((end - s.startedAt) / 1000),
      per, correct, pass: cut.length === 0 && correct >= RULE.totalMin,
    };
    const key = s.key;
    state.session = null;
    save();
    view = { name: 'result', key, filter: 'all' };
    render();
    window.scrollTo({ top: 0 });
    if (expired) ask('시간 종료', '제한 시간 종료로 답안을 자동 제출했습니다.', '확인', null);
  }

  function finishPractice() {
    const s = state.session;
    const answers = {};
    for (const id of s.ids) if (s.checked[id]) answers[id] = s.answers[id];
    const correct = s.ids.filter((id) => answers[id] === Q.get(id).answer).length;
    state.results[s.key] = { mode: s.mode, key: s.key, title: s.title, ids: s.ids, answers, at: Date.now(), correct };
    const key = s.key;
    state.session = null;
    save();
    view = { name: 'result', key, filter: 'all' };
    render();
    window.scrollTo({ top: 0 });
  }

  /* ------------------------------------------------------------ 결과 */
  function renderResult() {
    const r = state.results[view.key];
    tools.innerHTML = '<button data-act="home">홈으로</button>';
    const status = (id) => (!r.answers[id] ? 'none' : r.answers[id] === Q.get(id).answer ? 'ok' : 'ng');
    const counts = { all: r.ids.length, ng: 0, none: 0, ok: 0 };
    r.ids.forEach((id) => { counts[status(id)] += 1; });
    const retryIds = r.ids.filter((id) => status(id) !== 'ok');

    let head;
    if (r.mode === 'mock') {
      const cut = r.per.filter((p) => p.correct < RULE.perSubjectMin);
      const avg = (r.correct / r.ids.length * 100).toFixed(1);
      let reason;
      if (r.pass) reason = `과목별 ${RULE.perSubjectMin}문항 이상, 전체 ${RULE.totalMin}문항 이상 충족`;
      else if (cut.length) reason = `과락: ${cut.map((p) => `${subjLabel(p.subject)} ${p.correct}문항`).join(', ')}`
        + (r.correct < RULE.totalMin ? ` · 전체 ${RULE.totalMin}문항 미달` : '');
      else reason = `전체 ${r.correct}문항 · 기준 ${RULE.totalMin}문항 미달`;
      const rows = r.per.map((p) => `<tr>
        <td>${subjLabel(p.subject)}</td><td>${p.correct} / ${p.total}</td><td>${p.correct * RULE.pointPerQuestion}점</td><td>${p.answered}</td>
        <td class="${p.correct < RULE.perSubjectMin ? 'cut' : 'okc'}">${p.correct < RULE.perSubjectMin ? '과락' : '통과'}</td></tr>`).join('');
      head = `
        <section class="card verdict ${r.pass ? 'pass' : 'fail'}" role="status">
          <h1>${esc(r.title)} · ${r.pass ? '합격' : '불합격'}</h1>
          <p>${reason}</p>
          <p>정답 ${r.correct} / ${r.ids.length} · 평균 ${avg}점 · 풀이 시간 ${clock(r.usedSec)}${r.expired ? ' · 시간 종료 자동 제출' : ''} · ${day(r.at)}</p>
        </section>
        <div class="card" style="padding:4px 16px;margin-bottom:18px;overflow-x:auto">
          <table class="score-table">
            <thead><tr><th scope="col">과목</th><th scope="col">정답</th><th scope="col">점수</th><th scope="col">응답</th><th scope="col">판정</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td>전체</td><td>${r.correct} / ${r.ids.length}</td><td>평균 ${avg}점</td><td>${r.ids.length - counts.none}</td>
              <td class="${r.pass ? 'okc' : 'cut'}">${r.pass ? '합격' : '불합격'}</td></tr></tfoot>
          </table>
        </div>`;
    } else {
      head = `
        <section class="card verdict ${r.correct === r.ids.length ? 'pass' : 'fail'}" role="status">
          <h1>${esc(r.title)} · ${r.correct} / ${r.ids.length}</h1>
          <p>정답 ${counts.ok} · 오답 ${counts.ng} · 미확인 ${counts.none} · ${day(r.at)}</p>
        </section>`;
    }

    const again = r.mode === 'mock'
      ? `<button data-act="start" data-mode="mock" data-key="${r.key}">같은 회차 다시 응시</button>`
      : r.mode === 'chapter' ? `<button data-act="start" data-mode="chapter" data-key="${r.key}">같은 장 다시 풀기</button>` : '';
    const actions = `<div class="result-actions">
        <button class="primary" data-act="retry" ${retryIds.length ? '' : 'disabled'}>틀린·미응답 문항 다시 풀기 (${retryIds.length})</button>
        ${again}
        <button data-act="home">홈으로</button>
      </div>`;

    const labels = { all: '전체', ng: '오답', none: r.mode === 'mock' ? '미응답' : '미확인', ok: '정답' };
    const tabs = `<div class="tabs" role="group" aria-label="해설 필터">${Object.keys(labels).map((k) => `<button data-act="filter" data-f="${k}" aria-pressed="${view.filter === k}">${labels[k]} ${counts[k]}</button>`).join('')}</div>`;

    const shown = r.ids.filter((id) => view.filter === 'all' || status(id) === view.filter);
    const list = shown.length ? shown.map((id) => {
      const q = Q.get(id);
      const a = r.answers[id];
      const st = status(id);
      return `<article class="card review-item">
        <div class="q-top"><span class="tag ${st === 'ok' ? '' : 'burgundy'}">${st === 'ok' ? '정답' : st === 'ng' ? '오답' : labels.none}</span>
          <span class="q-num">${srcLabel(q)} · ${subjLabel(q.subject)}</span></div>
        <div class="stem">${blocks(q.stem)}</div>
        <div class="choices">${choiceButtons(q, a, true, false)}</div>
        ${feedback(q, a)}
      </article>`;
    }).join('') : '<p class="card empty">해당 문항 없음</p>';

    app.innerHTML = `${head}${actions}<section aria-labelledby="h-review"><div class="section-head"><h2 id="h-review">문항별 해설</h2></div>${tabs}<div class="review-list">${list}</div></section>`;
  }

  /* ------------------------------------------------------------ 동작 */
  async function act(name, d) {
    const s = state.session;
    switch (name) {
      case 'home':
        view = { name: 'home' }; render(); window.scrollTo({ top: 0 }); break;
      case 'resume':
        if (s && s.mode === 'mock' && Date.now() >= s.deadline) { finishMock(true); break; }
        view = { name: 'quiz' }; render(); window.scrollTo({ top: 0 }); break;
      case 'abandon':
        if (await ask('응시 취소', `「${s.title}」 풀이 기록을 지웁니다. 채점하지 않으며 오답 목록에도 반영하지 않습니다.`, '응시 취소', '돌아가기')) {
          state.session = null; save(); render();
        }
        break;
      case 'start':
        if (d.mode === 'mock') { const e = EXAMS.find((x) => x.id === d.key); start('mock', e.id, e.questionIds.slice(), e.title); }
        else { const c = CHAPTERS.find((x) => x.id === d.key); start('chapter', c.id, c.questionIds.slice(), `${c.no}장 ${c.title}`); }
        break;
      case 'start-wrong': {
        const sub = d.subject ? Number(d.subject) : null;
        const ids = wrongIds().filter((id) => !sub || Q.get(id).subject === sub);
        if (ids.length) start('wrong', 'wrong', ids, sub ? `오답 다시 풀기 · ${subjLabel(sub)}` : '오답 다시 풀기');
        break;
      }
      case 'retry': {
        const r = state.results[view.key];
        const ids = r.ids.filter((id) => r.answers[id] !== Q.get(id).answer);
        if (ids.length) start('wrong', 'wrong', ids, `${setTitle(r.key)} · 틀린·미응답 문항`);
        break;
      }
      case 'show-result':
        view = { name: 'result', key: d.key, filter: 'all' }; render(); window.scrollTo({ top: 0 }); break;
      case 'filter':
        view.filter = d.f; render(); break;
      case 'choose':
        if (!s || (s.mode !== 'mock' && s.checked[s.ids[s.index]])) break;
        s.answers[s.ids[s.index]] = Number(d.n); save(); render(); break;
      case 'check': {
        const id = s.ids[s.index];
        if (!s.answers[id] || s.checked[id]) break;
        s.checked[id] = true; record(id, s.answers[id]); save(); render(); break;
      }
      case 'prev': go(s.index - 1); break;
      case 'next': go(s.index + 1); break;
      case 'jump': go(Number(d.i)); break;
      case 'submit': {
        const left = s.ids.length - Object.keys(s.answers).length;
        const text = left ? `미응답 ${left}문항. 미응답 문항은 오답으로 채점합니다.\n답안을 제출하시겠습니까?` : '답안을 제출하시겠습니까?';
        if (await ask('답안 제출', text, '제출')) finishMock(false);
        break;
      }
      case 'finish': {
        const left = s.ids.length - Object.keys(s.checked).length;
        if (left && !(await ask('풀이 종료', `정답 확인 전 문항 ${left}개. 결과를 보시겠습니까?`, '결과 보기'))) break;
        finishPractice();
        break;
      }
      case 'reset':
        if (await ask('학습 기록 초기화', '이 브라우저에 저장한 풀이 기록, 오답 목록, 진행 중인 풀이를 모두 지웁니다.', '초기화')) {
          state = { log: {}, results: {}, session: null }; save(); view = { name: 'home' }; render();
        }
        break;
      default: break;
    }
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled || !modal.hidden) return;
    e.preventDefault();
    act(b.dataset.act, b.dataset);
  });
  document.querySelector('.brand').addEventListener('click', (e) => { e.preventDefault(); if (modal.hidden) act('home', {}); });

  document.addEventListener('keydown', (e) => {
    if (!modal.hidden) {
      if (e.key === 'Escape') closeModal(false);
      return;
    }
    if (view.name !== 'quiz' || !state.session || e.ctrlKey || e.metaKey || e.altKey) return;
    const s = state.session;
    const id = s.ids[s.index];
    const checked = s.mode !== 'mock' && s.checked[id];
    if (/^[1-4]$/.test(e.key) && !checked) { act('choose', { n: e.key }); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { act('prev', {}); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { act('next', {}); e.preventDefault(); }
    else if (e.key === 'Enter' && s.mode !== 'mock' && !(e.target instanceof HTMLButtonElement)) {
      if (!checked && s.answers[id]) act('check', {});
      else if (checked) act(s.index === s.ids.length - 1 ? 'finish' : 'next', {});
      e.preventDefault();
    }
  });

  /* 다른 탭에서 기록이 바뀌면 다시 읽기 */
  window.addEventListener('storage', (e) => { if (e.key === STORE) { state = load(); render(); } });

  render();
})();
