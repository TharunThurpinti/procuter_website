
import { useState } from "react";
import "./App.css";

const API = "https://grey-fundamentals-painted-macintosh.trycloudflare.com";

function StandardCard({ item, index }) {
  const title =
    item.title?.trim() ||
    item.document?.trim() ||
    "Standard title unavailable";

  const score = Number(item.similarity_score);
  const scoreText = Number.isFinite(score)
    ? `${(score * 100).toFixed(1)}%`
    : "N/A";

  return (
    <article className="standard-card">
      <div className="standard-top">
        <span className="standard-number">
          MATCH {String(index + 1).padStart(2, "0")}
        </span>
        <span className="score">{scoreText} similarity</span>
      </div>

      <h3>{item.standard_id || item.id || "Standard ID unavailable"}</h3>
      <p className="standard-title">{title}</p>

      {item.description?.trim() && (
        <p className="standard-description">{item.description}</p>
      )}

      <div className="standard-footer">
        <span className="domain-tag">{item.domain || "BIS standard"}</span>
        <span className="verification">
          Candidate · Verify with official BIS sources
        </span>
      </div>
    </article>
  );
}

function ResultSection({ results }) {
  const standards = Array.isArray(results.results)
    ? results.results
    : [];

  const pdfAnalyses = Array.isArray(results.analyses)
    ? results.analyses
    : [];

  const gaps = Array.isArray(results.potential_gaps_for_review)
    ? results.potential_gaps_for_review
    : [];

  return (
    <section className="results-section" aria-live="polite">
      <div className="results-heading">
        <div>
          <span className="eyebrow dark-eyebrow">YOUR RESULTS</span>
          <h2>
            {results.filename
              ? "Procurement Document Analysis"
              : "Recommended BIS Standards"}
          </h2>
          <p className="muted">
            {results.query
              ? `Search: "${results.query}"`
              : results.filename
                ? `Document: ${results.filename}`
                : "Review the candidate standards below."}
          </p>
        </div>

        {!results.filename && (
          <div className="result-count">
            <strong>{standards.length}</strong>
            <span>matches</span>
          </div>
        )}
      </div>

      {standards.length > 0 && (
        <div className="standards-list">
          {standards.map((item, index) => (
            <StandardCard
              key={item.id || item.standard_id || index}
              item={item}
              index={index}
            />
          ))}
        </div>
      )}

      {pdfAnalyses.length > 0 && (
        <div className="pdf-analyses">
          <h3>Extracted Requirements & Candidate Standards</h3>
          {pdfAnalyses.map((analysis, index) => (
            <article className="requirement-card" key={index}>
              <span className="standard-number">
                REQUIREMENT {String(index + 1).padStart(2, "0")}
              </span>
              <p className="requirement-text">{analysis.requirement}</p>

              {analysis.candidate_standards?.length > 0 ? (
                <div className="standards-list nested-list">
                  {analysis.candidate_standards.map((item, i) => (
                    <StandardCard
                      key={item.id || item.standard_id || i}
                      item={item}
                      index={i}
                    />
                  ))}
                </div>
              ) : (
                <p className="muted">No candidate standards returned.</p>
              )}
            </article>
          ))}
        </div>
      )}

      {gaps.length > 0 && (
        <div className="gaps-panel">
          <h3>Potential Gaps for Human Review</h3>
          {gaps.map((gap, index) => (
            <div className="gap-item" key={index}>
              <strong>{gap.area || "Review item"}</strong>
              <p>{gap.observation}</p>
              <p className="gap-action">{gap.action}</p>
            </div>
          ))}
        </div>
      )}

      {standards.length === 0 &&
        pdfAnalyses.length === 0 &&
        gaps.length === 0 && (
          <p className="muted">The API returned no displayable results.</p>
        )}

      <p className="disclaimer">
        These are AI-retrieved candidates, not confirmed compliance decisions.
        Verify standard titles, current status, and applicability against
        official BIS sources.
      </p>
    </section>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState(
    "Construction and building materials"
  );
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);
  const [activeTab, setActiveTab] = useState("search");

  async function sendRequest(path, form) {
    setLoading(true);
    setError("");
    setResults(null);

    try {
      const response = await fetch(`${API}${path}`, {
        method: "POST",
        body: form,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "The request failed."
        );
      }

      setResults(data);
    } catch (err) {
      setError(
        `${err.message}. Check your internet connection and ensure the Colab API and tunnel are running.`
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(event) {
    event.preventDefault();

    if (!query.trim()) {
      setError("Enter a procurement requirement first.");
      return;
    }

    const form = new FormData();
    form.append("query", query.trim());
    form.append("domain", domain);
    sendRequest("/search", form);
  }

  function handlePDF(event) {
    event.preventDefault();

    if (!file) {
      setError("Please select a procurement PDF.");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    form.append("domain", domain);
    sendRequest("/analyze-pdf", form);
  }

  return (
    <main className="app-shell">
      <nav className="navbar">
        <div className="brand-mark">BIS</div>
        <div className="brand-copy">
          <strong>Procurement Intelligence</strong>
          <span>Standards Recommendation Platform</span>
        </div>
        <span className="nav-badge">ACADEMIC PROTOTYPE</span>
      </nav>

      <header className="hero">
        <span className="eyebrow">AI-POWERED STANDARD DISCOVERY</span>
        <h1>Find the right standards<br />for your procurement needs.</h1>
        <p>
          Search the indexed BIS catalogue using natural language or analyze
          a procurement PDF to identify relevant candidate standards and
          potential specification gaps.
        </p>
        <div className="hero-points">
          <span>Semantic search</span>
          <span>8,037 indexed records</span>
          <span>PDF requirement analysis</span>
        </div>
      </header>

      <section className="workspace">
        <div className="workspace-heading">
          <div>
            <span className="eyebrow dark-eyebrow">WORKSPACE</span>
            <h2>What would you like to do?</h2>
          </div>
        </div>

        <div className="tabs">
          <button
            type="button"
            className={activeTab === "search" ? "tab active" : "tab"}
            onClick={() => {
              setActiveTab("search");
              setError("");
            }}
          >
            Search standards
          </button>
          <button
            type="button"
            className={activeTab === "pdf" ? "tab active" : "tab"}
            onClick={() => {
              setActiveTab("pdf");
              setError("");
            }}
          >
            Analyze PDF
          </button>
        </div>

        <div className="form-area">
          <label htmlFor="domain">Standards domain</label>
          <select
            id="domain"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
          >
            <option>Construction and building materials</option>
            <option>Electrical and electronics</option>
            <option>Both / manual review</option>
          </select>

          {activeTab === "search" ? (
            <form onSubmit={handleSearch}>
              <label htmlFor="query">Describe your requirement</label>
              <textarea
                id="query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="e.g. Cement requirements for road construction"
                required
                spellCheck="true"
              />
              <p className="field-hint">
                Tip: Include the material, intended use, and required test
                or performance property where known.
              </p>
              <button className="primary-button" disabled={loading}>
                {loading ? "Searching the catalogue…" : "Find standards"}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePDF}>
              <label htmlFor="pdf">Procurement document (PDF)</label>
              <input
                id="pdf"
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) =>
                  setFile(event.target.files?.[0] || null)
                }
                required
              />
              {file && <p className="field-hint">Selected: {file.name}</p>}
              <button className="primary-button" disabled={loading}>
                {loading ? "Analyzing document…" : "Analyze document"}
              </button>
            </form>
          )}
        </div>

        {loading && (
          <div className="loading-message" role="status">
            <span className="spinner" />
            Searching the BIS catalogue. This may take a moment.
          </div>
        )}

        {error && (
          <div className="error-message" role="alert">
            <strong>Unable to complete the request</strong>
            <p>{error}</p>
          </div>
        )}
      </section>

      {results && <ResultSection results={results} />}

      <footer className="site-footer">
        <div>
          <strong>BIS Procurement Intelligence</strong>
          <p>React · FastAPI · ChromaDB · Sentence Transformers</p>
        </div>
        <span>Academic project prototype</span>
      </footer>
    </main>
  );
}
