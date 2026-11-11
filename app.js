/* 사무자동화산업기사 필기 CBT — 빌드 없는 정적 앱. 데이터는 data/bank.js(window.CBT_BANK).
   화면 형식: 첫 화면은 교재 표지(노랑 띠·원색 알약), 풀이·해설·결과는 교재 내지(버건디 절·파랑 문항 번호·꼬리표 상자). */
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
  const circ = (s) => s.replace(/[①-⑩]/g, '<span class="circ">$&</span>');
  const inline = (s) => circ(esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'));
  const mark = (k) => `<span class="circ">${CIRCLED[k - 1]}</span>`;
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
  const stag = (id) => `<span class="stag s${id}">${id}과목</span>`;
  const n = (s) => `<span class="num">${s}</span>`;
  const kbd = (k) => `<kbd>${k}</kbd>`;
  function bandTag(mode, key) {
    if (mode === 'mock') return `MOCK ${two(key.slice(1))}`;
    if (mode === 'chapter') return `CHAPTER ${two(key.slice(1))}`;
    return 'REVIEW';
  }
  function refHtml(q) {
    const m = /^(\d+\.\d+)절\s*(.*)$/.exec(q.ref || '');
    if (!m) return `<span class="ref"><span class="ref-label">관련 절</span>${esc(q.ref)}</span>`;
    return `<span class="ref"><span class="ref-label">관련 절</span><span class="sec-no">${m[1]}</span><span>${esc(m[2] || '절')}</span></span>`;
  }

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
    document.querySelectorAll('[data-timer]').forEach((el) => {
      el.textContent = clock(left);
      const box = el.closest('.timer');
      if (box) box.classList.toggle('warn', left <= 600);
    });
  }

  /* ------------------------------------------------------------ 첫 화면 */
  function renderHome() {
    tools.innerHTML = '';
    const solved = Object.keys(state.log).length;
    const okCount = Object.values(state.log).filter((l) => l.last).length;
    const wrong = wrongIds();
    const s = state.session;

    const mockPills = EXAMS.map((e) => `
      <button class="pill" data-act="start" data-mode="mock" data-key="${e.id}">
        <span class="pill-tag">모의</span><span class="pill-text">${esc(e.title)}</span><span class="pill-meta">${n(`${e.questionIds.length}문항 · ${e.minutes}분`)}</span>
      </button>`).join('');

    const cover = `
      <section class="cover" aria-label="필기 CBT 시작">
        <div class="wrap cover-inner">
          <div class="cover-text">
            <p class="cover-agency">교재 부속 필기 CBT · 자체 문항 ${BANK.questions.length}</p>
            <p class="cover-year">2027</p>
            <h1 class="cover-title"><span>사무자동화</span><span>산업기사</span></h1>
            <div class="cover-key">
              <span class="key" data-text="1권 필기"><span class="key-shadow" aria-hidden="true">1권 필기</span><span class="key-fill">1권 필기</span></span>
              <span class="cover-cbt">CBT</span>
              <div class="badge-gear" role="img" aria-label="출제기준 2026–2028 반영"><div>출제기준<strong>2026–2028</strong>반영</div></div>
            </div>
            <p class="cover-slant"><span>모의고사 ${EXAMS.length}회 · 대표 문제 ${CHAPTERS.reduce((a, c) => a + c.questionIds.length, 0)} · 전 문항 해설</span></p>
          </div>
          <div class="cover-pills">
            ${mockPills}
            <div class="pair">
              <button class="pill ink" data-act="scroll" data-target="sec-ch"><span class="pill-tag">장별</span><span class="pill-text">2~8장 대표 문제</span></button>
              <button class="pill ink" data-act="start-wrong" ${wrong.length ? '' : 'disabled'}><span class="pill-tag">오답</span><span class="pill-text">다시 풀기</span><span class="pill-meta">${n(wrong.length)}</span></button>
            </div>
          </div>
        </div>
      </section>`;

    let resume = '';
    if (s) {
      const answered = Object.keys(s.answers).length;
      const extra = s.mode === 'mock' ? ` · 남은 시간 <span class="num" data-timer>${clock((s.deadline - Date.now()) / 1000)}</span>` : '';
      resume = `<div class="note warn resume" role="status">
        <div><span class="note-tag">진행 중</span><p><strong>${esc(s.title)}</strong> · 답안 ${n(`${answered} / ${s.ids.length}`)}${extra}</p></div>
        <div class="actions"><button class="btn danger" data-act="abandon">응시 취소</button><button class="btn primary" data-act="resume">이어서 풀기</button></div>
      </div>`;
    }

    const examCards = EXAMS.map((e) => {
      const r = state.results[e.id];
      const last = r
        ? `<p class="last">최근 결과 <span class="chip ${r.pass ? 'blue' : 'burgundy'}">${r.pass ? '합격' : '불합격'}</span>${n(`${r.correct}문항 · ${(r.correct / e.questionIds.length * 100).toFixed(1)}점`)}${n(day(r.at))}</p>`
        : '<p class="last none">응시 기록 없음</p>';
      return `<article class="exam-card">
        <div class="band"><span class="band-tag">MOCK ${two(e.no)}</span><h3>${esc(e.title)}</h3></div>
        <div class="exam-body">
          <dl class="facts"><div><dt>문항</dt><dd>${e.questionIds.length}</dd></div><div><dt>시간</dt><dd>${e.minutes}분</dd></div><div><dt>과목</dt><dd>${BANK.subjects.length}</dd></div></dl>
          ${last}
          <div class="exam-actions">
            <button class="btn primary" data-act="start" data-mode="mock" data-key="${e.id}">응시 시작</button>
            ${r ? `<button class="btn" data-act="show-result" data-key="${e.id}">결과·해설</button>` : ''}
          </div>
        </div>
      </article>`;
    }).join('');

    const chapterRows = CHAPTERS.map((c) => {
      const r = state.results[c.id];
      return `<div class="ch-row">
        <span class="ch-no">${c.no}<small>장</small></span>
        <div><h3>${esc(c.title)}</h3><p class="ch-meta">${stag(c.subject)}${n(`${c.questionIds.length}문항`)}${r ? n(`최근 ${r.correct}/${r.ids.length}`) : ''}</p></div>
        <button class="btn small" data-act="start" data-mode="chapter" data-key="${c.id}">연습 시작</button>
      </div>`;
    }).join('');

    const subjPills = BANK.subjects.map((sub) => {
      const cnt = wrong.filter((id) => Q.get(id).subject === sub.id).length;
      return `<button class="pill mini s${sub.id}" data-act="start-wrong" data-subject="${sub.id}" ${cnt ? '' : 'disabled'}><span class="pill-tag">${sub.id}과목</span><span class="pill-text">${n(`${cnt}문항`)}</span></button>`;
    }).join('');

    app.innerHTML = `${cover}
      <div class="wrap page">
        ${resume}
        <section class="block" id="sec-mock" aria-labelledby="h-mock">
          <div class="sec"><span class="sec-no">01</span><h2 id="h-mock">필기 모의고사</h2><p>60문항 · 1시간 30분 · 제출 전 정답 비공개 · 시간 종료 시 자동 제출</p></div>
          <div class="exam-grid">${examCards}</div>
          <div class="note rule-note"><span class="note-tag">합격 기준</span><p>과목별 ${RULE.perSubject}문항 가운데 ${RULE.perSubjectMin}문항(40점) 이상, 전체 ${RULE.totalMin}문항(평균 60점) 이상. 과목별 ${RULE.perSubjectMin}문항 미만은 과락. 미응답 문항은 오답으로 채점.</p></div>
        </section>
        <section class="block" id="sec-ch" aria-labelledby="h-ch">
          <div class="sec"><span class="sec-no">02</span><h2 id="h-ch">장별 연습</h2><p>2~8장 대표 문제 · 문항별 즉시 채점 · 시간 제한 없음</p></div>
          <div class="sheet chapter-list">${chapterRows}</div>
        </section>
        <section class="block" id="sec-wrong" aria-labelledby="h-wrong">
          <div class="sec"><span class="sec-no">03</span><h2 id="h-wrong">오답 다시 풀기</h2><p>마지막 풀이가 오답인 문항 · 정답 처리 시 목록에서 제외</p></div>
          <div class="sheet wrong-box">
            <p class="wrong-count">오답 문항<strong>${wrong.length}</strong></p>
            <div><div class="wrong-subj">${subjPills}</div><p class="ch-meta">푼 문항 ${n(solved)} · 최근 정답률 ${n(`${solved ? Math.round(okCount / solved * 100) : 0}%`)}</p></div>
            <button class="btn primary" data-act="start-wrong" ${wrong.length ? '' : 'disabled'}>전체 오답 풀기</button>
          </div>
        </section>
        <div class="home-foot"><button class="btn danger small" data-act="reset" ${solved || s || Object.keys(state.results).length ? '' : 'disabled'}>학습 기록 초기화</button></div>
      </div>`;
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

  /* ------------------------------------------------------------ 문항 표시 */
  function choiceButtons(q, chosen, reveal, interactive) {
    return q.choices.map((c, i) => {
      const k = i + 1;
      const cls = ['choice'];
      let flag = '';
      if (reveal) {
        if (k === q.answer) { cls.push('correct'); flag = `<span class="chip blue">${k === chosen ? '정답 · 선택' : '정답'}</span>`; }
        else if (k === chosen) { cls.push('incorrect'); flag = '<span class="chip burgundy">선택</span>'; }
      } else if (k === chosen) cls.push('selected');
      const attrs = interactive && !reveal ? `data-act="choose" data-n="${k}"` : 'disabled';
      return `<button type="button" class="${cls.join(' ')}" ${attrs} aria-pressed="${k === chosen}" aria-label="${CIRCLED[i]} ${esc(c)}">
        <span class="ch-num" aria-hidden="true">${k}</span><span>${inline(c)}</span><span>${flag}</span></button>`;
    }).join('');
  }

  function feedback(q, chosen) {
    const ok = chosen === q.answer;
    const verdict = !chosen ? '<span class="chip gray">미응답</span>'
      : ok ? '<span class="chip blue">맞음</span>' : `<span class="chip burgundy">오답 · 선택 ${mark(chosen)}</span>`;
    return `<div class="note explain-box">
      <div class="explain-head"><span class="note-tag">해설</span>${verdict}<span class="chip line-blue">정답 ${mark(q.answer)}</span>${refHtml(q)}</div>
      <div class="explain">${blocks(q.explanation)}</div>
    </div>`;
  }

  function questionHead(q, right) {
    return `<div class="subj-bar"><span class="subj-box">${q.subject}과목</span><span class="subj-name">${esc(SUBJ.get(q.subject))}</span><span class="q-pos">${right}</span></div>
      <div class="q-main"><span class="q-no" aria-label="${q.number}번">${two(q.number)}</span><div class="stem">${blocks(q.stem)}</div></div>`;
  }

  /* ------------------------------------------------------------ 문제 풀이 */
  function renderQuiz() {
    const s = state.session;
    const q = Q.get(s.ids[s.index]);
    const chosen = s.answers[q.id];
    const isMock = s.mode === 'mock';
    const checked = !isMock && !!s.checked[q.id];
    const answered = Object.keys(s.answers).length;
    const last = s.index === s.ids.length - 1;

    tools.innerHTML = (isMock ? `<span class="timer" role="timer" aria-label="남은 시간"><span class="timer-label">남은 시간</span><span class="timer-value" data-timer>${clock((s.deadline - Date.now()) / 1000)}</span></span>` : '')
      + '<button class="btn small" data-act="home">홈으로</button>';

    const sub = isMock
      ? `${s.ids.length}문항 · 제한 ${EXAMS.find((e) => e.id === s.key).minutes}분 · 제출 전 정답 비공개`
      : `${s.ids.length}문항 · 문항별 정답 확인 · 시간 제한 없음`;

    const prevBtn = `<button class="btn" data-act="prev" ${s.index === 0 ? 'disabled' : ''}>이전</button>`;
    let right;
    let keys;
    if (isMock) {
      right = `<button class="btn primary" data-act="next" ${last ? 'disabled' : ''}>다음</button>`;
      keys = `${kbd('1')}~${kbd('4')} 답 선택 · ${kbd('←')} ${kbd('→')} 문항 이동`;
    } else if (!checked) {
      right = `<button class="btn" data-act="next" ${last ? 'disabled' : ''}>건너뛰기</button><button class="btn blue" data-act="check" ${chosen ? '' : 'disabled'}>정답 확인</button>`;
      keys = `${kbd('1')}~${kbd('4')} 답 선택 · ${kbd('Enter')} 정답 확인 · ${kbd('←')} ${kbd('→')} 문항 이동`;
    } else {
      right = last
        ? '<button class="btn primary" data-act="finish">결과 보기</button>'
        : '<button class="btn primary" data-act="next">다음 문항</button>';
      keys = `${kbd('Enter')} ${last ? '결과 보기' : '다음 문항'} · ${kbd('←')} ${kbd('→')} 문항 이동`;
    }

    const pos = isMock ? n(`${q.number} / ${s.ids.length}`) : `${n(`${s.index + 1} / ${s.ids.length}`)} · ${srcLabel(q)}`;
    const doneCount = isMock ? answered : Object.keys(s.checked).length;

    const navGroups = groupForNav(s).map((g) => `
      <p class="nav-sub">${g.label}</p>
      <div class="nav-grid">${g.items.map(({ id, i }) => {
        const cls = [];
        if (isMock) { if (s.answers[id]) cls.push('answered'); }
        else if (s.checked[id]) cls.push(s.answers[id] === Q.get(id).answer ? 'ok' : 'ng');
        if (i === s.index) cls.push('current');
        const label = isMock ? Q.get(id).number : i + 1;
        return `<button class="${cls.join(' ')}" data-act="jump" data-i="${i}" aria-label="${label}번${s.answers[id] ? ' 답안 있음' : ''}"${i === s.index ? ' aria-current="true"' : ''}>${label}</button>`;
      }).join('')}</div>`).join('');

    const legend = isMock
      ? '<div class="legend"><span><i class="l-cur"></i>현재 문항</span><span><i class="l-ans"></i>답안 있음</span><span><i></i>미응답</span></div>'
      : '<div class="legend"><span><i class="l-cur"></i>현재 문항</span><span><i class="l-ans"></i>정답</span><span><i class="l-ng"></i>오답</span><span><i></i>미확인</span></div>';

    app.innerHTML = `
      <div class="wrap page">
        <div class="band"><span class="band-tag">${bandTag(s.mode, s.key)}</span><h1>${esc(s.title)}</h1><p class="band-end">${sub}</p></div>
        <div class="quiz-layout">
          <article class="sheet question" aria-label="문항">
            ${questionHead(q, pos)}
            <div class="choices" role="group" aria-label="보기">${choiceButtons(q, chosen, checked, true)}</div>
            ${checked ? feedback(q, chosen) : ''}
            <div class="q-bottom">${prevBtn}<div class="right">${right}</div></div>
            <p class="keys">${keys}</p>
          </article>
          <aside class="sheet navigator" aria-label="문항 이동">
            <div class="nav-head"><h2>${isMock ? '답안' : '정답 확인'}</h2>${n(`${doneCount} / ${s.ids.length}`)}</div>
            <div class="progress" aria-hidden="true"><span style="width:${doneCount / s.ids.length * 100}%"></span></div>
            ${navGroups}
            ${legend}
            ${isMock
              ? '<button class="btn primary" data-act="submit">답안 제출</button>'
              : '<button class="btn primary" data-act="finish">풀이 종료 · 결과 보기</button>'}
          </aside>
        </div>
      </div>`;
  }

  function groupForNav(s) {
    const items = s.ids.map((id, i) => ({ id, i }));
    if (s.mode === 'mock') {
      return BANK.subjects.map((sub) => {
        const mine = items.filter(({ id }) => Q.get(id).subject === sub.id);
        const done = mine.filter(({ id }) => s.answers[id]).length;
        return { label: `${stag(sub.id)}${esc(sub.name)}${n(`${done}/${mine.length}`)}`, items: mine };
      });
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
    tools.innerHTML = '<button class="btn small" data-act="home">홈으로</button>';
    const status = (id) => (!r.answers[id] ? 'none' : r.answers[id] === Q.get(id).answer ? 'ok' : 'ng');
    const counts = { all: r.ids.length, ng: 0, none: 0, ok: 0 };
    r.ids.forEach((id) => { counts[status(id)] += 1; });
    const retryIds = r.ids.filter((id) => status(id) !== 'ok');
    const labels = { all: '전체', ng: '오답', none: r.mode === 'mock' ? '미응답' : '미확인', ok: '정답' };

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
        <td>${stag(p.subject)}${esc(SUBJ.get(p.subject))}</td><td>${p.correct} / ${p.total}</td><td>${p.correct * RULE.pointPerQuestion}점</td><td class="col-ans">${p.answered}</td>
        <td><span class="chip ${p.correct < RULE.perSubjectMin ? 'burgundy' : 'blue'}">${p.correct < RULE.perSubjectMin ? '과락' : '통과'}</span></td></tr>`).join('');
      head = `
        <div class="band"><span class="band-tag">RESULT</span><h1>${esc(r.title)}</h1><span class="verdict-chip band-end ${r.pass ? 'pass' : 'fail'}">${r.pass ? '합격' : '불합격'}</span></div>
        <div class="note ${r.pass ? 'blue' : 'warn'} verdict-note" role="status">
          <span class="note-tag">판정</span>
          <p class="big">${reason}</p>
          <p>정답 ${n(`${r.correct} / ${r.ids.length}`)} · 평균 ${n(`${avg}점`)} · 풀이 시간 ${n(clock(r.usedSec))}${r.expired ? ' · 시간 종료 자동 제출' : ''} · ${n(day(r.at))}</p>
        </div>
        <div class="score-wrap">
          <table class="score-table">
            <thead><tr><th scope="col">과목</th><th scope="col">정답</th><th scope="col">점수</th><th scope="col" class="col-ans">응답</th><th scope="col">판정</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td>전체</td><td>${r.correct} / ${r.ids.length}</td><td><span class="avg-label">평균 </span>${avg}점</td><td class="col-ans">${r.ids.length - counts.none}</td>
              <td><span class="chip ${r.pass ? 'blue' : 'burgundy'}">${r.pass ? '합격' : '불합격'}</span></td></tr></tfoot>
          </table>
        </div>`;
    } else {
      head = `
        <div class="band"><span class="band-tag">RESULT</span><h1>${esc(r.title)}</h1><span class="verdict-chip band-end plain">${n(`${r.correct} / ${r.ids.length}`)}</span></div>
        <div class="note blue verdict-note" role="status">
          <span class="note-tag">채점</span>
          <p class="big">정답 ${n(counts.ok)} · 오답 ${n(counts.ng)} · ${labels.none} ${n(counts.none)}</p>
          <p>${n(day(r.at))}</p>
        </div>`;
    }

    const again = r.mode === 'mock'
      ? `<button class="btn" data-act="start" data-mode="mock" data-key="${r.key}">같은 회차 다시 응시</button>`
      : r.mode === 'chapter' ? `<button class="btn" data-act="start" data-mode="chapter" data-key="${r.key}">같은 장 다시 풀기</button>` : '';
    const actions = `<div class="result-actions">
        <button class="btn primary" data-act="retry" ${retryIds.length ? '' : 'disabled'}>틀린·미응답 문항 다시 풀기 (${retryIds.length})</button>
        ${again}
        <button class="btn" data-act="home">홈으로</button>
      </div>`;

    const tabs = `<div class="tabs" role="group" aria-label="해설 필터">${Object.keys(labels).map((k) => `<button data-act="filter" data-f="${k}" aria-pressed="${view.filter === k}">${labels[k]} ${n(counts[k])}</button>`).join('')}</div>`;

    const shown = r.ids.filter((id) => view.filter === 'all' || status(id) === view.filter);
    const list = shown.length ? shown.map((id) => {
      const q = Q.get(id);
      const a = r.answers[id];
      const st = status(id);
      const chip = `<span class="chip ${st === 'ok' ? 'blue' : st === 'ng' ? 'burgundy' : 'gray'}">${st === 'ok' ? '정답' : st === 'ng' ? '오답' : labels.none}</span>`;
      return `<article class="sheet review-item">
        ${questionHead(q, `${srcLabel(q)} ${chip}`)}
        <div class="choices">${choiceButtons(q, a, true, false)}</div>
        ${feedback(q, a)}
      </article>`;
    }).join('') : '<p class="sheet empty">해당 문항 없음</p>';

    app.innerHTML = `<div class="wrap page">${head}${actions}
      <section class="block" aria-labelledby="h-review">
        <div class="sec"><span class="sec-no">해설</span><h2 id="h-review">문항별 해설</h2><p>선택한 답 · 정답 · 해설 · 관련 절</p></div>
        ${tabs}<div class="review-list">${list}</div>
      </section></div>`;
  }

  /* ------------------------------------------------------------ 동작 */
  async function act(name, d) {
    const s = state.session;
    switch (name) {
      case 'home':
        view = { name: 'home' }; render(); window.scrollTo({ top: 0 }); break;
      case 'scroll': {
        const el = document.getElementById(d.target);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
        break;
      }
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
