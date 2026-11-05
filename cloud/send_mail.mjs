// cloud_out/mail.html 을 SMTP(다우오피스)로 발송.
// env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_TO, (MODE=test 이면 TEST_TO로)
import fsp from 'node:fs/promises';
import nodemailer from 'nodemailer';
const OUT = process.env.OUT_DIR || 'cloud_out';
const html = await fsp.readFile(`${OUT}/mail.html`, 'utf8');
const subject = (await fsp.readFile(`${OUT}/subject.txt`, 'utf8')).trim();
const to = process.env.MODE === 'test' ? (process.env.TEST_TO || process.env.SMTP_USER) : (process.env.MAIL_TO || 'mice@atomice.co.kr');
const port = Number(process.env.SMTP_PORT || 465);
const tx = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'outbound.daouoffice.com', port, secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
const info = await tx.sendMail({ from: process.env.MAIL_FROM || `"장화수" <${process.env.SMTP_USER}>`, to, subject, html });
console.log('메일 발송 완료', to, subject, info.messageId, info.response);
