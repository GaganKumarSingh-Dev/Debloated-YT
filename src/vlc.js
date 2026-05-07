const { spawn } = require('child_process');
const net = require('net');

let currentProcess = null;

function resolveVlcPath(config, options = {}) {
  return options.vlcPath || (config && config.vlcPath) || 'vlc';
}

function normalizeStreams(streamInput) {
  if (Array.isArray(streamInput)) {
    return streamInput.filter(Boolean);
  }
  if (streamInput && Array.isArray(streamInput.streamUrls)) {
    return streamInput.streamUrls.filter(Boolean);
  }
  if (streamInput && streamInput.streamUrl) {
    return [streamInput.streamUrl];
  }
  return streamInput ? [streamInput] : [];
}

function play(streamInput, options = {}, config = {}) {
  const streamUrls = normalizeStreams(streamInput);
  if (!streamUrls.length) {
    throw new Error('A stream URL is required to launch VLC.');
  }

  const args = [
    '--no-video-title-show',
    '--no-qt-privacy-ask',
    '--no-qt-error-dialogs'
  ];

  if (options.enableRc) {
    args.unshift('--extraintf', 'rc', '--rc-host', 'localhost:9090', '--rc-quiet');
  }

  if (options.subtitlePath) {
    args.push('--sub-file', options.subtitlePath);
  }
  if (Number.isFinite(Number(options.startTime)) && Number(options.startTime) > 0) {
    args.push(`--start-time=${Math.floor(Number(options.startTime))}`);
  }
  if (options.playlist) {
    args.push(...streamUrls);
  } else if (streamUrls.length > 1) {
    args.push(`--input-slave=${streamUrls.slice(1).join('#')}`);
    args.push(streamUrls[0]);
  } else {
    args.push(streamUrls[0]);
  }

  const child = spawn(resolveVlcPath(config, options), args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  currentProcess = child;
  return {
    pid: child.pid,
    launchedAt: new Date().toISOString()
  };
}

function sendRc(commands, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let output = '';
    let settled = false;
    const finish = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(output);
      }
    };
    const timer = setTimeout(() => finish(new Error('VLC RC interface timed out.')), timeoutMs);
    socket.on('data', (data) => {
      output += data.toString();
    });
    socket.on('error', finish);
    socket.connect(9090, '127.0.0.1', () => {
      const payload = `${commands.join('\n')}\n`;
      socket.write(payload);
      setTimeout(() => finish(), 150);
    });
  });
}

async function getTimestamp() {
  const output = await sendRc(['get_time', 'logout']);
  const matches = output.match(/(?:^|\D)(\d{1,8})(?:\D|$)/g) || [];
  const parsed = matches
    .map((item) => Number.parseInt(item.replace(/\D/g, ''), 10))
    .filter((item) => Number.isFinite(item));
  return parsed.length ? parsed[parsed.length - 1] : 0;
}

async function stop() {
  await sendRc(['stop', 'quit']).catch(() => {});
  currentProcess = null;
  return true;
}

async function switchQuality(newStreamInput, options = {}, config = {}) {
  const timestamp = Number.isFinite(Number(options.startTime))
    ? Number(options.startTime)
    : await getTimestamp().catch(() => 0);
  await stop();
  return play(newStreamInput, { ...options, startTime: timestamp, enableRc: true }, config);
}

function getCurrentProcess() {
  return currentProcess;
}

module.exports = {
  play,
  getTimestamp,
  stop,
  switchQuality,
  getCurrentProcess
};
