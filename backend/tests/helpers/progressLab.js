const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

// Lab tự sở hữu cổng/data-dir, không đọc .env hay nhận URI DB bên ngoài.
async function startProgressLab() {
  const binary = process.env.MONGOD_BINARY;
  if (!binary || !fs.existsSync(binary)) throw new Error('Cần MONGOD_BINARY trỏ tới mongod đã cài để chạy QA độc lập.');
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const base = process.platform === 'win32' ? path.join(os.tmpdir(), 'opencode') : os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, 'parent-progress-qa-'));
  const processHandle = spawn(binary, ['--dbpath', directory, '--port', String(port), '--bind_ip', '127.0.0.1', '--replSet', 'progressQA', '--oplogSize', '64'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stop = async () => {
    await mongoose.disconnect();
    if (processHandle.exitCode === null) {
      const exit = new Promise((resolve) => processHandle.once('exit', resolve));
      processHandle.kill(); await exit;
    }
    // Giữ data-dir QA mới tạo ở thư mục tạm để không xóa nhầm dữ liệu; không chứa secret thật.
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MongoDB QA khởi động quá hạn')), 30000);
      const onData = (data) => { if (data.toString().includes('Waiting for connections')) { clearTimeout(timer); resolve(); } };
      processHandle.stdout.on('data', onData);
      processHandle.stderr.on('data', () => {});
      processHandle.once('error', (error) => { clearTimeout(timer); reject(error); });
      processHandle.once('exit', () => { clearTimeout(timer); reject(new Error('MongoDB QA kết thúc trước khi sẵn sàng')); });
    });
    const uri = `mongodb://127.0.0.1:${port}/parent-progress-qa?directConnection=true`;
    const client = new mongoose.mongo.MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
    await client.connect();
    await client.db('admin').command({ replSetInitiate: { _id: 'progressQA', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
    let primary = false;
    for (let i = 0; i < 100; i++) {
      if ((await client.db('admin').command({ hello: 1 })).isWritablePrimary) { primary = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await client.close();
    if (!primary) throw new Error('Replica set QA chưa bầu được primary');
    await mongoose.connect(uri);
    return { stop, directory, password: crypto.randomBytes(24).toString('hex') };
  } catch (error) { await stop(); throw error; }
}
module.exports = { startProgressLab };
