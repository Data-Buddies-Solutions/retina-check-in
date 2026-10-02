import { api } from "./lib/api";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import {
  ArrowRight,
  Check,
  Search,
  PenLine,
  Users,
  Printer,
  Upload,
  Download,
  QrCode,
  LockKeyhole,
  CircleCheck,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import "./App.css";
type Person = {
  id: string;
  name: string;
  license: string;
  ce: string;
  paid: string;
  signature: string | null;
  signedAt: string | null;
  walkIn: boolean;
};
const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
function Brand() {
  return (
    <img
      className="brand"
      src="/retina-logo.png"
      alt="Retina Consultants of Miami"
    />
  );
}
function signatureImage(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width,
    top = height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (pixels[(y * width + x) * 4 + 3] > 0) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (left > right) return canvas.toDataURL();
  const crop = document.createElement("canvas");
  crop.width = right - left + 21;
  crop.height = bottom - top + 21;
  crop
    .getContext("2d")!
    .drawImage(
      canvas,
      left,
      top,
      right - left + 1,
      bottom - top + 1,
      10,
      10,
      right - left + 1,
      bottom - top + 1,
    );
  return crop.toDataURL("image/png");
}
function Signing({
  person,
  onBack,
  onDone,
}: {
  person: Person | null;
  onBack: () => void;
  onDone: (name: string) => void;
}) {
  const [details, setDetails] = useState<Person | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!person) return;
    let active = true;
    api("/api/attendees/" + person.id)
      .then((data) => {
        if (active) setDetails(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [person]);
  if (person && !details)
    return (
      <Card className="entry-card">
        <Button variant="ghost" onClick={onBack}>
          Back to names
        </Button>
        <p
          role={error ? "alert" : "status"}
          className={error ? "error" : "muted"}
        >
          {error || "Loading your details…"}
        </p>
      </Card>
    );
  return <SignForm person={details} onBack={onBack} onDone={onDone} />;
}
function SignForm({
  person,
  onBack,
  onDone,
}: {
  person: Person | null;
  onBack: () => void;
  onDone: (name: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    pad = useRef<SignaturePad | null>(null);
  const [name, setName] = useState(person?.name || ""),
    [license, setLicense] = useState(person?.license || ""),
    [ce, setCe] = useState(person?.ce || "?"),
    [paid, setPaid] = useState(person?.paid || ""),
    [ink, setInk] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const c = canvas.current!;
    const p = new SignaturePad(c, {
      penColor: "#092b46",
      minWidth: 1,
      maxWidth: 2.8,
    });
    pad.current = p;
    const resize = () => {
      const data = p.toData();
      const ratio = window.devicePixelRatio || 1;
      c.width = c.offsetWidth * ratio;
      c.height = c.offsetHeight * ratio;
      c.getContext("2d")!.scale(ratio, ratio);
      p.clear();
      p.fromData(data);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(c);
    p.addEventListener("endStroke", () => setInk(!p.isEmpty()));
    return () => {
      observer.disconnect();
      p.off();
    };
  }, []);
  async function submit() {
    if (!pad.current || pad.current.isEmpty()) {
      setError("Please sign in the box before submitting.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api(
        "/api/sign",
        post({
          id: person?.id,
          name,
          license,
          ce,
          paid,
          signature: signatureImage(canvas.current!),
        }),
      );
      onDone(result.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="entry-card signing-card">
      <Button variant="ghost" className="back" onClick={onBack}>
        Back to names
      </Button>
      <h2>Confirm your details</h2>
      <p className="muted">
        Check your information, make any corrections, then sign below.
      </p>
      <div className="walk-in-fields review-fields">
        <Label htmlFor="full-name">Full name</Label>
        <Input
          id="full-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dr. First Last"
          maxLength={150}
        />
        <Label htmlFor="license">OPC / license number</Label>
        <Input
          id="license"
          value={license}
          onChange={(e) => setLicense(e.target.value)}
          placeholder="OPC 1234 or N/A"
          maxLength={80}
        />
        <div className="detail-choices">
          <div>
            <Label>CE credit requested</Label>
            <Choice
              label="CE credit requested"
              value={ce}
              options={["YES", "NO", "?"]}
              onChange={setCe}
            />
          </div>
          <div>
            <Label>Have you paid?</Label>
            <Choice
              label="Have you paid?"
              value={paid}
              options={["", "YES", "NO", "N/A"]}
              onChange={setPaid}
            />
          </div>
        </div>
      </div>
      <div className="signature-label">
        <Label htmlFor="signature">Your signature</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            pad.current?.clear();
            setInk(false);
          }}
        >
          Clear
        </Button>
      </div>
      <div className="signature-box">
        <canvas
          id="signature"
          ref={canvas}
          aria-label="Draw your signature using your finger or mouse"
        />
        {!ink && (
          <div className="signature-hint">
            <span>Sign here with your finger or mouse</span>
          </div>
        )}
        <div className="signature-line" />
      </div>
      <p className="signature-note">
        By signing, you confirm your attendance and that the details above are
        correct.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button
        className="primary-action"
        disabled={busy || !ink || !name.trim() || !license.trim()}
        onClick={submit}
      >
        {busy ? "Saving signature…" : "Submit signature"}
      </Button>
    </Card>
  );
}
function Attendee() {
  const [people, setPeople] = useState<Person[]>([]),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Person | null>(null),
    [step, setStep] = useState("choose"),
    [done, setDone] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = () => {
    setLoading(true);
    api("/api/attendees")
      .then(setPeople)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    refresh();
  }, []);
  const reset = () => {
    setDone("");
    setQuery("");
    setSelected(null);
    setStep("choose");
    refresh();
  };
  const matches = people.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="attendee-shell">
      <header className="checkin-header">
        <Brand />
        <p>CE EVENT 2026</p>
      </header>
      <main className="attendee-layout">
        {step === "choose" ? (
          <Card className="entry-card">
            <h1>Find your name</h1>
            <p className="muted">Select your name, then sign to check in.</p>
            <Input
              className="name-search"
              aria-label="Search your name"
              placeholder="Search your name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="list-label">
              ATTENDEES <span>{matches.length}</span>
            </div>
            <div className="guest-list">
              {loading ? (
                <p className="empty">Loading guest list…</p>
              ) : matches.length ? (
                matches.map((p) => (
                  <Button
                    key={p.id}
                    variant="ghost"
                    className="guest"
                    disabled={!!p.signedAt}
                    onClick={() => {
                      setSelected(p);
                      setStep("sign");
                    }}
                  >
                    <span>{p.name}</span>
                    {p.signedAt && (
                      <span className="signed-status">Signed in</span>
                    )}
                  </Button>
                ))
              ) : (
                <p className="empty">
                  {people.length
                    ? "No matching name. Try another spelling or use “I’m not listed.”"
                    : "The guest list is empty. Use “I’m not listed” to check in."}
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="error">
                {error}{" "}
                <Button variant="link" onClick={refresh}>
                  Retry
                </Button>
              </p>
            )}
            <div className="not-listed">
              <Button
                variant="link"
                onClick={() => {
                  setSelected(null);
                  setStep("sign");
                }}
              >
                I’m not listed
              </Button>
            </div>
          </Card>
        ) : step === "sign" ? (
          <Signing
            person={selected}
            onBack={() => setStep("choose")}
            onDone={(name) => {
              setDone(name);
              setStep("done");
            }}
          />
        ) : (
          <Card className="entry-card success">
            <h2>Thank you, {done.replace(/^Dr\. /, "").split(" ")[0]}.</h2>
            <p>Your signature is saved. Enjoy the event.</p>
            <span className="signed-confirmation">Successfully signed in</span>
            <Button className="primary-action" onClick={reset}>
              Next attendee
            </Button>
          </Card>
        )}
      </main>
      <footer className="checkin-footer">
        <a href="/staff">Staff access</a>
      </footer>
    </div>
  );
}
function Choice({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <Select
      value={value || "unset"}
      onValueChange={(v) => onChange(v === "unset" ? "" : v)}
    >
      <SelectTrigger aria-label={label} className="status-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((v) => (
          <SelectItem value={v || "unset"} key={v}>
            {v || "Not recorded"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Staff() {
  const [auth, setAuth] = useState(false),
    [pin, setPin] = useState(""),
    [people, setPeople] = useState<Person[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [connection, setConnection] = useState<{
      url: string;
      qr: string;
      local: boolean;
    } | null>(null),
    [showQR, setShowQR] = useState(false),
    [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  async function refresh() {
    try {
      setPeople(await api("/api/staff"));
      setAuth(true);
    } catch (e) {
      if ((e as Error).message.includes("PIN")) setAuth(false);
      else setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!auth) return;
    api("/api/connection")
      .then(setConnection)
      .catch((e) => setError(e.message));
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [auth]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/login", post({ pin }));
      setPin("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function edit(p: Person, changes: Partial<Person>) {
    setError("");
    try {
      await api("/api/staff/" + p.id, {
        ...post({ ...p, ...changes }),
        method: "PATCH",
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await api("/api/import", { method: "POST", body: form });
      setNotice(result.message);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (upload.current) upload.current.value = "";
    }
  }
  const signed = people.filter((p) => p.signedAt).length;
  return (
    <>
      <div className="staff-screen">
        <header className="site-header">
          <Brand />
          <div className="header-actions">
            <a href="/">
              Attendee view <ArrowRight size={15} />
            </a>
            {auth && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await api("/api/logout", post({}));
                  setAuth(false);
                }}
              >
                <LogOut size={15} /> Sign out
              </Button>
            )}
          </div>
        </header>
        {!auth ? (
          <Card className="login-card">
            <LockKeyhole size={28} />
            <h2>Welcome, event team.</h2>
            <p className="muted">
              Enter your staff PIN to manage the sign-in sheet.
            </p>
            <form onSubmit={login}>
              <Label htmlFor="pin">Staff PIN</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="current-password"
              />
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <Button className="primary-action" type="submit">
                Open event dashboard <ArrowRight size={17} />
              </Button>
            </form>
          </Card>
        ) : (
          <main className="dashboard">
            <div className="dashboard-title">
              <div>
                <div className="eyebrow">CE EVENT 2026 · STAFF DASHBOARD</div>
                <h1>Your event, at a glance.</h1>
                <p className="muted">
                  One guest list. Every signature. Ready to print.
                </p>
              </div>
              <Button onClick={() => window.print()}>
                <Printer size={17} /> Print sign-in sheet
              </Button>
            </div>
            <div className="stats">
              <Card>
                <span>Registered attendees</span>
                <strong>{people.length}</strong>
                <Users />
              </Card>
              <Card>
                <span>Signed in</span>
                <strong>
                  {signed}
                  <small> / {people.length}</small>
                </strong>
                <CircleCheck />
              </Card>
              <Card>
                <span>Awaiting signature</span>
                <strong>{people.length - signed}</strong>
                <PenLine />
              </Card>
            </div>
            <div className="toolbar">
              <div className="search-wrap">
                <Search size={18} />
                <Input
                  aria-label="Search attendees"
                  placeholder="Search attendees…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="tools">
                <Button variant="outline" onClick={() => setShowQR(!showQR)}>
                  <QrCode size={17} /> Check-in QR
                </Button>
                <Button variant="outline" asChild>
                  <a href="/api/template">
                    <Download size={17} /> Template
                  </a>
                </Button>
                <Button disabled={busy} onClick={() => upload.current?.click()}>
                  <Upload size={17} />
                  {busy ? "Uploading…" : "Upload list"}
                </Button>
                <input
                  ref={upload}
                  type="file"
                  accept=".csv,.xlsx"
                  hidden
                  onChange={(e) => void importFile(e.target.files?.[0])}
                />
              </div>
            </div>
            {showQR && connection && (
              <Card className="qr-card">
                <img
                  src={connection.qr}
                  alt="QR code to open attendee check-in"
                />
                <div>
                  <h2>Scan. Sign. You’re in.</h2>
                  <p>
                    {connection.local
                      ? "Connect phones to the same Wi-Fi as this computer."
                      : "Scan with your phone’s camera to open attendee check-in."}
                  </p>
                  <a href={connection.url}>{connection.url}</a>
                  <p className="muted">
                    {connection.local
                      ? "Keep this computer awake and the local server running."
                      : "Works on any phone, tablet, or computer with internet access."}
                  </p>
                </div>
              </Card>
            )}
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="notice">
                {notice}
              </p>
            )}
            <Card className="roster-card">
              <div className="roster-heading">
                <h2>Attendee list</h2>
                <Badge variant="secondary">Updates every 5 seconds</Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>License number</TableHead>
                    <TableHead>CE credit</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Signature</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {people
                    .filter((p) =>
                      p.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="name-cell">
                          {p.name}
                          {p.walkIn && (
                            <Badge variant="outline">Walk-in · follow up</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            key={p.id + p.license}
                            aria-label={`License for ${p.name}`}
                            defaultValue={p.license}
                            className="license-input"
                            maxLength={80}
                            onBlur={(e) => {
                              if (e.target.value !== p.license)
                                void edit(p, { license: e.target.value });
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Choice
                            label={`CE credit for ${p.name}`}
                            value={p.ce}
                            options={["YES", "NO", "?"]}
                            onChange={(ce) => void edit(p, { ce })}
                          />
                        </TableCell>
                        <TableCell>
                          <Choice
                            label={`Paid status for ${p.name}`}
                            value={p.paid}
                            options={["", "YES", "NO", "N/A"]}
                            onChange={(paid) => void edit(p, { paid })}
                          />
                        </TableCell>
                        <TableCell>
                          {p.signature ? (
                            <div className="signed-cell">
                              <img
                                src={p.signature}
                                alt={`Signature of ${p.name}`}
                              />
                              <span>
                                <Check size={12} /> Signed in
                              </span>
                            </div>
                          ) : (
                            <span className="pending">Awaiting signature</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Card>
            <div className="dashboard-footer">
              <p>
                CSV or Excel (.xlsx) uploads add new attendees. Existing names
                and signatures are kept.
              </p>
              <a href="/api/backup">
                Download backup <Download size={14} />
              </a>
            </div>
          </main>
        )}
      </div>
      {auth && (
        <section className="print-sheet">
          <header>
            <Brand />
            <div>
              <h1>Sign-In Sheet</h1>
              <p>CE Event 2026</p>
            </div>
          </header>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>License Number</th>
                <th>CE Credit</th>
                <th>Paid (Y/N)</th>
                <th>Signature</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.license}</td>
                  <td>{p.ce}</td>
                  <td>{p.paid}</td>
                  <td>
                    {p.signature && (
                      <img src={p.signature} alt={`Signature of ${p.name}`} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
export default function App() {
  return location.pathname.startsWith("/staff") ? <Staff /> : <Attendee />;
}
