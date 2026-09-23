(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------
  var BUZZER_SECONDS = 5;
  var ANSWER_SECONDS = 8;
  var COUNTDOWN_START = 3;
  var TRANSITION_DELAY_MS = 1400; // pause after correct/skip before advancing

  var SAMPLE_QUESTIONS = [
    { question: 'What planet is known as the Red Planet?', options: { A: 'Venus', B: 'Mars', C: 'Jupiter', D: 'Saturn' }, correct: 'B' },
    { question: 'How many continents are there on Earth?', options: { A: '5', B: '6', C: '7', D: '8' }, correct: 'C' },
    { question: 'What is the capital of Japan?', options: { A: 'Seoul', B: 'Beijing', C: 'Bangkok', D: 'Tokyo' }, correct: 'D' },
    { question: 'Which ocean is the largest on Earth?', options: { A: 'Atlantic', B: 'Indian', C: 'Pacific', D: 'Arctic' }, correct: 'C' },
    { question: 'Who painted the Mona Lisa?', options: { A: 'Van Gogh', B: 'Da Vinci', C: 'Picasso', D: 'Monet' }, correct: 'B' },
    { question: 'What is the chemical symbol for gold?', options: { A: 'Go', B: 'Gd', C: 'Au', D: 'Ag' }, correct: 'C' },
    { question: 'How many legs does a spider have?', options: { A: '6', B: '8', C: '10', D: '12' }, correct: 'B' },
    { question: 'What is the largest mammal in the world?', options: { A: 'Elephant', B: 'Giraffe', C: 'Blue Whale', D: 'Polar Bear' }, correct: 'C' },
    { question: 'In which year did the Titanic sink?', options: { A: '1905', B: '1912', C: '1918', D: '1923' }, correct: 'B' },
    { question: 'What gas do plants absorb from the atmosphere?', options: { A: 'Oxygen', B: 'Nitrogen', C: 'Carbon Dioxide', D: 'Hydrogen' }, correct: 'C' }
  ];

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  var state = {
    questionsArray: [],
    currentQuestionIndex: 0,
    player1Score: 0,
    player2Score: 0,
    activePlayer: null,
    reboundPlayer: null,
    isRebound: false,
    timerInterval: null
  };

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  var screens = {
    landing: document.getElementById('screen-landing'),
    countdown: document.getElementById('screen-countdown'),
    buzzer: document.getElementById('screen-buzzer'),
    answer: document.getElementById('screen-answer'),
    results: document.getElementById('screen-results')
  };

  var el = {
    fileInput: document.getElementById('file-input'),
    useSampleBtn: document.getElementById('use-sample-btn'),
    startBtn: document.getElementById('start-btn'),
    loadStatus: document.getElementById('load-status'),

    roundLabel: document.getElementById('round-label'),
    countdownNumber: document.getElementById('countdown-number'),

    buzzP1: document.getElementById('buzz-p1'),
    buzzP2: document.getElementById('buzz-p2'),
    scoreP1: document.getElementById('score-p1'),
    scoreP2: document.getElementById('score-p2'),
    buzzerTimer: document.getElementById('buzzer-timer'),
    buzzerTimerRing: document.querySelector('#screen-buzzer .timer-ring'),
    buzzerQuestionText: document.getElementById('buzzer-question-text'),
    progressLabel: document.getElementById('progress-label'),

    answerScoreP1: document.getElementById('answer-score-p1'),
    answerScoreP2: document.getElementById('answer-score-p2'),
    activePlayerBanner: document.getElementById('active-player-banner'),
    answerTimer: document.getElementById('answer-timer'),
    answerTimerRing: document.querySelector('#screen-answer .timer-ring'),
    answerQuestionText: document.getElementById('answer-question-text'),
    choiceButtons: Array.prototype.slice.call(document.querySelectorAll('.answer-choice')),

    feedbackFlash: document.getElementById('feedback-flash'),

    winnerBanner: document.getElementById('winner-banner'),
    finalScoreP1: document.getElementById('final-score-p1'),
    finalScoreP2: document.getElementById('final-score-p2'),
    finalCardP1: document.getElementById('final-card-p1'),
    finalCardP2: document.getElementById('final-card-p2'),
    restartBtn: document.getElementById('restart-btn')
  };

  // ---------------------------------------------------------------------
  // Touch-first tap helper (touchstart primary, click fallback for mouse)
  // ---------------------------------------------------------------------
  function addTapListener(node, handler) {
    var recentTouch = false;
    node.addEventListener('touchstart', function (e) {
      recentTouch = true;
      e.preventDefault();
      handler(e);
      setTimeout(function () { recentTouch = false; }, 500);
    }, { passive: false });
    node.addEventListener('click', function (e) {
      if (recentTouch) return;
      handler(e);
    });
  }

  // Block pinch-zoom / double-tap-zoom / swipe-to-refresh gestures globally.
  document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  // ---------------------------------------------------------------------
  // Screen management
  // ---------------------------------------------------------------------
  function showScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle('active', key === name);
    });
  }

  // ---------------------------------------------------------------------
  // Excel / CSV parsing
  // ---------------------------------------------------------------------
  var HEADER_ALIASES = {
    question: 'question',
    'option a': 'A', optiona: 'A', a: 'A',
    'option b': 'B', optionb: 'B', b: 'B',
    'option c': 'C', optionc: 'C', c: 'C',
    'option d': 'D', optiond: 'D', d: 'D',
    'correct answer': 'correct', correctanswer: 'correct', answer: 'correct', correct: 'correct'
  };

  function normalizeHeader(h) {
    var key = String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return HEADER_ALIASES[key] || HEADER_ALIASES[key.replace(/\s+/g, '')] || null;
  }

  function rowsToQuestions(rows) {
    if (!rows.length) return [];
    var sampleRow = rows[0];
    var headerMap = {};
    Object.keys(sampleRow).forEach(function (rawHeader) {
      var norm = normalizeHeader(rawHeader);
      if (norm) headerMap[norm] = rawHeader;
    });

    var out = [];
    rows.forEach(function (row) {
      var questionText = headerMap.question ? String(row[headerMap.question] || '').trim() : '';
      if (!questionText) return;
      var options = {};
      ['A', 'B', 'C', 'D'].forEach(function (letter) {
        options[letter] = headerMap[letter] ? String(row[headerMap[letter]] || '').trim() : '';
      });
      var correctRaw = headerMap.correct ? String(row[headerMap.correct] || '').trim().toUpperCase() : '';
      var correct = ['A', 'B', 'C', 'D'].indexOf(correctRaw) !== -1 ? correctRaw : null;
      if (!options.A || !options.B || !options.C || !options.D || !correct) return;
      out.push({ question: questionText, options: options, correct: correct });
    });
    return out;
  }

  function loadWorkbookFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var data = new Uint8Array(e.target.result);
          var workbook = XLSX.read(data, { type: 'array' });
          var firstSheetName = workbook.SheetNames[0];
          var sheet = workbook.Sheets[firstSheetName];
          var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          var questions = rowsToQuestions(rows);
          if (!questions.length) {
            reject(new Error('No valid question rows found. Check column headers.'));
            return;
          }
          resolve(questions);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () { reject(new Error('Could not read file.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function setLoadStatus(message, kind) {
    el.loadStatus.textContent = message;
    el.loadStatus.classList.remove('ok', 'error');
    if (kind) el.loadStatus.classList.add(kind);
  }

  function setQuestions(questions, sourceLabel) {
    state.questionsArray = questions;
    setLoadStatus(questions.length + ' questions loaded from ' + sourceLabel + '.', 'ok');
    el.startBtn.disabled = questions.length === 0;
  }

  el.fileInput.addEventListener('change', function () {
    var file = el.fileInput.files && el.fileInput.files[0];
    if (!file) return;
    setLoadStatus('Loading ' + file.name + '...', null);
    loadWorkbookFile(file).then(function (questions) {
      setQuestions(questions, file.name);
    }).catch(function (err) {
      setLoadStatus('Error: ' + err.message, 'error');
      el.startBtn.disabled = true;
    });
  });

  addTapListener(el.useSampleBtn, function () {
    var questions = SAMPLE_QUESTIONS.map(function (q) {
      return { question: q.question, options: q.options, correct: q.correct };
    });
    setQuestions(questions, 'sample set');
  });

  // ---------------------------------------------------------------------
  // Timer helper
  // ---------------------------------------------------------------------
  function clearGameTimer() {
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }

  function runCountdownTimer(seconds, onTick, onExpire) {
    clearGameTimer();
    var remaining = seconds;
    onTick(remaining);
    state.timerInterval = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearGameTimer();
        onTick(0);
        onExpire();
      } else {
        onTick(remaining);
      }
    }, 1000);
  }

  // ---------------------------------------------------------------------
  // Game flow
  // ---------------------------------------------------------------------
  function startGame() {
    if (!state.questionsArray.length) return;
    state.currentQuestionIndex = 0;
    state.player1Score = 0;
    state.player2Score = 0;
    updateScoreboards();
    goToCountdown();
  }

  function goToCountdown() {
    clearGameTimer();
    showScreen('countdown');
    el.roundLabel.textContent = 'Question ' + (state.currentQuestionIndex + 1) + ' / ' + state.questionsArray.length;
    var count = COUNTDOWN_START;
    el.countdownNumber.textContent = String(count);
    el.countdownNumber.style.animation = 'none';
    void el.countdownNumber.offsetWidth;
    el.countdownNumber.style.animation = '';

    clearGameTimer();
    state.timerInterval = setInterval(function () {
      count -= 1;
      if (count <= 0) {
        clearGameTimer();
        goToBuzzerPhase();
        return;
      }
      el.countdownNumber.textContent = String(count);
      el.countdownNumber.style.animation = 'none';
      void el.countdownNumber.offsetWidth;
      el.countdownNumber.style.animation = '';
    }, 1000);
  }

  function currentQuestion() {
    return state.questionsArray[state.currentQuestionIndex];
  }

  function goToBuzzerPhase() {
    var q = currentQuestion();
    state.activePlayer = null;
    state.isRebound = false;

    showScreen('buzzer');
    el.buzzerQuestionText.textContent = q.question;
    el.progressLabel.textContent = 'Question ' + (state.currentQuestionIndex + 1) + ' of ' + state.questionsArray.length;
    el.buzzP1.classList.remove('disabled', 'pressed');
    el.buzzP2.classList.remove('disabled', 'pressed');
    el.buzzerTimerRing.classList.remove('urgent');
    updateScoreboards();

    runCountdownTimer(
      BUZZER_SECONDS,
      function (remaining) {
        el.buzzerTimer.textContent = String(remaining);
        el.buzzerTimerRing.classList.toggle('urgent', remaining <= 2);
      },
      function () {
        // Timeout: nobody buzzed in.
        el.buzzP1.classList.add('disabled');
        el.buzzP2.classList.add('disabled');
        showFeedbackFlash('show-timeout', 'TIME UP!', function () {
          advanceToNextQuestion();
        });
      }
    );
  }

  function handleBuzz(playerNumber) {
    if (state.activePlayer !== null) return; // already claimed
    if (!screens.buzzer.classList.contains('active')) return;
    clearGameTimer();
    state.activePlayer = playerNumber;
    el.buzzP1.classList.add('disabled');
    el.buzzP2.classList.add('disabled');
    (playerNumber === 1 ? el.buzzP1 : el.buzzP2).classList.add('pressed');

    setTimeout(function () {
      goToAnswerPhase(playerNumber, []);
    }, 500);
  }

  addTapListener(el.buzzP1, function () { handleBuzz(1); });
  addTapListener(el.buzzP2, function () { handleBuzz(2); });

  function goToAnswerPhase(playerNumber, excludedChoices) {
    var q = currentQuestion();
    state.activePlayer = playerNumber;
    showScreen('answer');
    el.answerQuestionText.textContent = q.question;
    el.answerTimerRing.classList.remove('urgent');

    ['A', 'B', 'C', 'D'].forEach(function (letter) {
      document.getElementById('choice-text-' + letter).textContent = q.options[letter];
    });

    el.activePlayerBanner.textContent = 'PLAYER ' + playerNumber + "'S TURN";
    el.activePlayerBanner.classList.remove('p1', 'p2');
    el.activePlayerBanner.classList.add(playerNumber === 1 ? 'p1' : 'p2');

    el.choiceButtons.forEach(function (btn) {
      var letter = btn.getAttribute('data-choice');
      btn.classList.remove('correct', 'wrong', 'disabled');
      if (excludedChoices.indexOf(letter) !== -1) {
        btn.classList.add('disabled');
      }
    });

    updateScoreboards();

    runCountdownTimer(
      ANSWER_SECONDS,
      function (remaining) {
        el.answerTimer.textContent = String(remaining);
        el.answerTimerRing.classList.toggle('urgent', remaining <= 2);
      },
      function () {
        resolveAnswer(null, playerNumber, excludedChoices);
      }
    );
  }

  el.choiceButtons.forEach(function (btn) {
    addTapListener(btn, function () {
      if (btn.classList.contains('disabled')) return;
      if (!screens.answer.classList.contains('active')) return;
      var letter = btn.getAttribute('data-choice');
      resolveAnswer(letter, state.activePlayer, getExcludedChoices());
    });
  });

  function getExcludedChoices() {
    return el.choiceButtons
      .filter(function (btn) { return btn.classList.contains('disabled'); })
      .map(function (btn) { return btn.getAttribute('data-choice'); });
  }

  function resolveAnswer(chosenLetter, playerNumber, excludedChoices) {
    clearGameTimer();
    var q = currentQuestion();
    var isCorrect = chosenLetter === q.correct;

    el.choiceButtons.forEach(function (btn) { btn.classList.add('disabled'); });

    if (chosenLetter) {
      var chosenBtn = el.choiceButtons.filter(function (b) { return b.getAttribute('data-choice') === chosenLetter; })[0];
      if (chosenBtn) chosenBtn.classList.add(isCorrect ? 'correct' : 'wrong');
    }

    if (isCorrect) {
      awardPoint(playerNumber);
      showFeedbackFlash('show-correct', 'CORRECT! +1 PLAYER ' + playerNumber, function () {
        advanceToNextQuestion();
      });
      return;
    }

    // Wrong or timeout.
    var wasRebound = excludedChoices.length > 0;
    if (wasRebound) {
      // No more players left to rebound to — safe to reveal the correct answer now.
      var correctBtn = el.choiceButtons.filter(function (b) { return b.getAttribute('data-choice') === q.correct; })[0];
      if (correctBtn) correctBtn.classList.add('correct');
      var flashLabel = chosenLetter ? 'WRONG!' : "TIME'S UP!";
      showFeedbackFlash('show-wrong', flashLabel + ' NO POINTS', function () {
        advanceToNextQuestion();
      });
    } else {
      var otherPlayer = playerNumber === 1 ? 2 : 1;
      var newExcluded = chosenLetter ? excludedChoices.concat([chosenLetter]) : excludedChoices;
      var label = chosenLetter ? 'WRONG! REBOUND TO PLAYER ' + otherPlayer : "TIME'S UP! REBOUND TO PLAYER " + otherPlayer;
      showFeedbackFlash('show-wrong', label, function () {
        goToAnswerPhase(otherPlayer, newExcluded);
      });
    }
  }

  function awardPoint(playerNumber) {
    if (playerNumber === 1) state.player1Score += 1;
    else state.player2Score += 1;
    updateScoreboards();
  }

  function updateScoreboards() {
    el.scoreP1.textContent = String(state.player1Score);
    el.scoreP2.textContent = String(state.player2Score);
    el.answerScoreP1.textContent = String(state.player1Score);
    el.answerScoreP2.textContent = String(state.player2Score);
  }

  function showFeedbackFlash(cssClass, text, callback) {
    el.feedbackFlash.textContent = text;
    el.feedbackFlash.className = 'feedback-flash ' + cssClass;
    setTimeout(function () {
      el.feedbackFlash.className = 'feedback-flash';
      callback();
    }, TRANSITION_DELAY_MS);
  }

  function advanceToNextQuestion() {
    state.currentQuestionIndex += 1;
    if (state.currentQuestionIndex >= state.questionsArray.length) {
      goToResults();
    } else {
      goToCountdown();
    }
  }

  function goToResults() {
    clearGameTimer();
    showScreen('results');
    el.finalScoreP1.textContent = String(state.player1Score);
    el.finalScoreP2.textContent = String(state.player2Score);
    el.finalCardP1.classList.remove('winner');
    el.finalCardP2.classList.remove('winner');

    if (state.player1Score > state.player2Score) {
      el.winnerBanner.textContent = 'PLAYER 1 WINS!';
      el.finalCardP1.classList.add('winner');
    } else if (state.player2Score > state.player1Score) {
      el.winnerBanner.textContent = 'PLAYER 2 WINS!';
      el.finalCardP2.classList.add('winner');
    } else {
      el.winnerBanner.textContent = "IT'S A TIE!";
    }
  }

  function restartToLanding() {
    clearGameTimer();
    state.currentQuestionIndex = 0;
    state.player1Score = 0;
    state.player2Score = 0;
    state.activePlayer = null;
    updateScoreboards();
    showScreen('landing');
  }

  addTapListener(el.startBtn, startGame);
  addTapListener(el.restartBtn, restartToLanding);

  // Prevent the start button from being tappable via label-triggered click twice.
  el.startBtn.addEventListener('click', function (e) {
    if (el.startBtn.disabled) e.preventDefault();
  });

  showScreen('landing');
})();
