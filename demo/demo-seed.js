// Demo only: the first time the demo opens in a browser, fill it with a tournament that is part-way through,
// so every screen has something to show. Settings → "Load sample data" or "Reset everything" starts over.
(function seedDemo() {
  if (Cloud.on || S.teams.length) return;   // never touches a live database or existing demo data
  const keepAds = S.settings.ads;   // ads added in Admin → Ads survive the demo being filled again
  loadSample();
  if (Array.isArray(keepAds)) S.settings.ads = keepAds;
  S.settings.prize = '₹50,000'; S.settings.organiser = 'DJ Esports';
  const thunder = S.teams.find(t => t.code === 'FF-0001').id;
  // Results that keep Team Thunder (the demo team) in the running.
  const play = ids => {
    const r = randomResults(ids);
    if (r[thunder] && r[thunder].place > 3) {
      const swap = Object.keys(r).find(k => r[k].place === 2);
      r[swap].place = r[thunder].place; r[thunder].place = 2; r[thunder].kills = Math.max(r[thunder].kills, 5);
    }
    return r;
  };
  const finish = st => st.groups.forEach(g => g.matches.forEach(m => {
    m.checkins = g.teamIds.slice(); m.results = play(g.teamIds); m.status = 'completed'; m.screenshots = ['match-' + m.no + '.png']; m.resultStatus = 'approved';
  }));

  // Stages 1–3 finished.
  let st = buildStage(0, slotTeams().filter(t => t.status === 'approved').sort((a, b) => a.slotNo - b.slotNo).map(t => t.id), 'sequential');
  S.stages.push(st);
  S.settings.regOpen = false;
  for (let i = 0; i < 3; i++) {
    makeMatches(st); st.status = 'published'; finish(st);
    st.qualified = qualifiersOf(st); st.status = 'done';
    st = buildStage(st.index + 1, st.qualified, 'seeded'); S.stages.push(st);
  }

  // Stage 4: Wild Cards placed, 3 of 6 matches played in every group.
  st.wcTray.slice().forEach(id => { const g = st.groups.reduce((a, b) => (b.teamIds.length < a.teamIds.length ? b : a)); g.teamIds.push(id); });
  st.wcTray = [];
  makeMatches(st); st.status = 'published';
  st.groups.forEach(g => g.matches.slice(0, 3).forEach(m => {
    m.checkins = g.teamIds.slice(); m.results = play(g.teamIds); m.status = 'completed'; m.screenshots = ['match-' + m.no + '.png']; m.resultStatus = 'approved';
  }));
  const tg = st.groups.find(g => g.teamIds.includes(thunder));
  const others = st.groups.filter(g => g !== tg);
  // Team Thunder's next match: checked in, room released.
  const m4 = tg.matches[3];
  Object.assign(m4, { status: 'room', roomId: '5566778', roomPass: 'sq4d', checkins: tg.teamIds.slice() });
  tg.teamIds.forEach(id => notify(id, 'room', m4.id, `${S.settings.name} · Stage 4 Group ${tg.label} Match 4 (${m4.map}, ${m4.time})\nRoom ID: 5566778\nPassword: sq4d`));
  // One match live, one result waiting for the admin.
  Object.assign(others[0].matches[3], { status: 'live', roomId: '1122334', roomPass: 'ff44', checkins: others[0].teamIds.slice() });
  Object.assign(others[1].matches[3], { status: 'completed', checkins: others[1].teamIds.slice(), results: randomResults(others[1].teamIds), screenshots: ['g' + others[1].label + '-m4.png'], resultStatus: 'submitted' });
  // WhatsApp group link with some captains joined.
  const k = st.index + '|' + tg.label;
  S.groupLinks[k] = { link: 'https://chat.whatsapp.com/DemoStage4Group' + tg.label, invites: {} };
  tg.teamIds.forEach((id, i) => {
    S.groupLinks[k].invites[id] = i < 5 ? 'joined' : i < 9 ? 'sent' : 'pending';
    notify(id, 'invite', k, `${S.settings.name} · Stage 4: join your Group ${tg.label} WhatsApp group: ${S.groupLinks[k].link}`);
  });
  // An open complaint for the admin to answer.
  // A made-up end-of-match screenshot so the admin can see how complaint images look.
  const cv = document.createElement('canvas'); cv.width = 960; cv.height = 540; const cx = cv.getContext('2d');
  cx.fillStyle = '#14130d'; cx.fillRect(0, 0, 960, 540); cx.fillStyle = '#f59e0b'; cx.font = 'bold 54px sans-serif'; cx.fillText('MATCH RESULT', 300, 130);
  cx.fillStyle = '#f6f1e4'; cx.font = 'bold 40px sans-serif'; cx.fillText('TEAM THUNDER  ·  #2', 250, 260); cx.fillText('KILLS: 8', 380, 340);
  cx.fillStyle = '#a39d8a'; cx.font = '24px sans-serif'; cx.fillText('Demo screenshot', 390, 470);
  S.complaints.unshift({ teamId: thunder, matchId: tg.matches[2].id, matchLabel: 'Stage 4 · Match 3', reason: 'Our 8 kills show as 6. Screenshot attached.', shot: 'thunder-m3.png', shotData: cv.toDataURL('image/jpeg', 0.75), status: 'open', at: new Date().toISOString() });
  // Screenshot test group: the teams and In Game Names from the sample Free Fire result screenshot
  // (ocr-service/samples/match-b.webp), so "Upload screenshots" can be tried on its next match.
  const ocrGroup = others[2] || others[others.length - 1];
  const SAMPLE = [
    ['Jd Esports', ['Jd.kuttyy!', 'Jd.hitlerr!', 'Jd.yashh!', 'INF SINGLE!!']],
    ['KG Gaming', ['G_MASSᴼᴾ', 'KG_FREDY', 'KG_SHADOW', 'Mz.Jackrose8']],
    ['KP Army', ['KP BEAST', 'KP SPARK', 'சந்திரசேகர்.', 'TN◉MADARA©']],
    ['TA Clan', ['TA ZENITSU', 'TA JACK', 'TA GOD', 'TA BRITANNIA']],
    ['Baba Squad', ['BABAYAGAAA', 'JERRY', 'AJAY', 'Kutty']],
    ['Night Owls', ['OWL.Ravi', 'OWL.Siva', 'OWL.Mani', 'OWL.Hari']],
    ['JJ Warriors', ['JJ.Devil4', 'Tw.Anandan05', 'JJ.Rocky', 'JJ.Blaze']],
    ['UFC', ['UFC.WOLF', 'UFC.smurt', 'UFC.BEAST', 'UFC.Praveen']],
    ['Dark Knights', ['DJaadhavan54', 'ɢᴏᴅ ᴏꜰ ᴇᴋ', 'ⓄBITO♡', 'சனி###']],
    ['WeSp', ['WeSp Samir', 'WeSp Lunaris', 'WeSp Ram', 'WeSp Rabin']],
    ['RES Esports', ['RES.TOXIC¹²', 'RES.SABUJ07', 'ANSAR -!!', 'RES.MADARA07']],
    ['TL Hybrid', ['TL.HYBRID07', '7SGOD', '7SVENOM', 'SREE.HXZ']]];
  if (ocrGroup) ocrGroup.teamIds.slice(0, 12).forEach((id, i) => { const t = team(id); t.name = SAMPLE[i][0]; SAMPLE[i][1].forEach((n, k) => { if (t.players[k]) t.players[k].name = n; }); });
  // Second screenshot test group: the owner's sample (ocr-service/samples/match-c.webp, ranks 1–10), registered with
  // styled In Game Names (small capitals, ᑌ, ✓, ♡ …) so the look-alike matching can be seen: the table shows these exact names.
  const ocrGroup2 = others[1];
  const SAMPLE2 = [
    ['ᑌD Esports', ['ᑌD ᴋᴜᴛᴛʏ ☣', 'ᑌD ᴊᴀᴄᴋ ☣', 'ᑌD ʀɪᴛʜɪᴄᴋ ♂', 'ᑌD ʜɪᴛʟᴇʀ ☣']],
    ['Legend Squad', ['TONY', 'TN_LEGEND✓⁘', 'TOJI', 'The_ᴡɪᴛᴄʜᴇʀ♡']],
    ['RK Gaming', ['RK ᴄʜᴜᴛᴛɪ !!', 'Rʙᴢ k4i5er11', 'RK ᴠɪᴊᴀʏ !', 'NKG.alpha07']],
    ['Rk Clan', ['M11PLAYS15!', 'Rk.Shinra18!', 'Rk.Mt7!', 'RK.gz.marco']],
    ['SRZ Army', ['SP!DY-SRZ!', 'A!ZEN-18', 'Pᴀɪɴ Lᴇᴏ', 'ROCKLEE~SRZ!']],
    ['DZ Carnage', ['DZ.CARNAGE!!', 'ML AXE 777', 'INF.Tenzo07!', 'KETTAVAN']],
    ['NBS Esports', ['NBS ʙʀᴜᴛᴀʟ', 'MLC.OXFORD', 'NBS ɪɴꜰᴇʀɴᴏ', 'NBS ʀᴇᴅᴇʏᴇ']],
    ['F1 Racers', ['F1 ᴄᴏᴏʟɪᴇ', 'F1 ᴠɪʀᴜꜱ', 'F1 BONXZ444', 'F1 ɢʀᴏᴏᴛ']],
    ['BZ Tamizha', ['BZ சரண்', 'BZ தமிழ்', 'BZ ~SUBASH', 'BZ Sᴘᴇᴇᴅ']],
    ['HL Hunters', ['HL K1zhi', 'A.I Prakaஷ்', 'HL.God!03', 'HL.Aiger!K22']]];
  if (ocrGroup2) ocrGroup2.teamIds.slice(0, SAMPLE2.length).forEach((id, i) => { const t = team(id); t.name = SAMPLE2[i][0]; SAMPLE2[i][1].forEach((n, k) => { if (t.players[k]) t.players[k].name = n; }); });
  // Same names in different teams (allowed: different players, different UIDs), to show how screenshots settle them:
  // inside this match (Group 3's other two teams) and in another group.
  if (ocrGroup2) {
    const [x, y] = ocrGroup2.teamIds.slice(SAMPLE2.length).map(team);
    if (x) x.players[0].name = 'ᴋᴜᴛᴛʏ';        // looks like ᑌD Esports' KUTTY once its tag is set aside
    if (y) y.players[1].name = 'TOJI';         // the same name as Legend Squad's TOJI
  }
  const clashGroup = others[0];
  if (clashGroup) { team(clashGroup.teamIds[0]).players[2].name = 'ᑌD ᴊᴀᴄᴋ ☣'; team(clashGroup.teamIds[1]).players[0].name = 'TONY'; }
  log('Demo data loaded', 'Stage 4 in progress');
  save();
  render();
})();
