import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getUserLeagues, createLeague, joinLeague } from "../services/appwrite";
import "../styles/Leagues.css";

export default function Leagues() {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const { user, userProfile, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadLeagues();
  }, [user]);

  const loadLeagues = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const userLeagues = await getUserLeagues(user.$id);
      setLeagues(userLeagues);
    } catch (err) {
      console.error("Error loading leagues:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    if (!newLeagueName.trim()) return;

    setActionLoading(true);
    setError("");

    try {
      const displayName = userProfile?.displayName || user.name || "Player";
      await createLeague(newLeagueName.trim(), user.$id, displayName, "Season");
      setShowCreateModal(false);
      setNewLeagueName("");
      await loadLeagues();
    } catch (err) {
      setError(err.message || "Failed to create league");
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinLeague = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setActionLoading(true);
    setError("");

    try {
      const displayName = userProfile?.displayName || user.name || "Player";
      await joinLeague(inviteCode.trim().toUpperCase(), user.$id, displayName);
      setShowJoinModal(false);
      setInviteCode("");
      await loadLeagues();
    } catch (err) {
      setError(err.message || "Failed to join league");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="leagues-page">
        <div className="loading">Loading leagues...</div>
      </div>
    );
  }

  return (
    <div className="leagues-page">
      <header className="leagues-header">
        <h1>🏀 SwishPot</h1>
        <div className="user-info">
          <span>{userProfile?.profileEmoji || "🏀"} {userProfile?.displayName || user?.name}</span>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </header>

      <main className="leagues-content">
        <div className="leagues-actions">
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            Create League
          </button>
          <button onClick={() => setShowJoinModal(true)} className="btn-secondary">
            Join League
          </button>
        </div>

        {leagues.length === 0 ? (
          <div className="no-leagues">
            <p>You're not in any leagues yet.</p>
            <p>Create a new league or join one with an invite code!</p>
          </div>
        ) : (
          <div className="leagues-list">
            {leagues.map((league) => (
              <div
                key={league.$id}
                className="league-card"
                onClick={() => navigate(`/league/${league.$id}`)}
              >
                <div className="league-info">
                  <h3>{league.name}</h3>
                  <p className="league-type">{league.leagueType} League</p>
                  <p className="league-members">
                    {league.members?.length || 0} member{(league.members?.length || 0) !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="league-code">
                  <span>Code: {league.inviteCode}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create League Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create League</h2>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleCreateLeague}>
              <div className="form-group">
                <label htmlFor="leagueName">League Name</label>
                <input
                  id="leagueName"
                  type="text"
                  value={newLeagueName}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  placeholder="My Awesome League"
                  required
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={actionLoading}>
                  {actionLoading ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join League Modal */}
      {showJoinModal && (
        <div className="modal-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Join League</h2>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleJoinLeague}>
              <div className="form-group">
                <label htmlFor="inviteCode">Invite Code</label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  required
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowJoinModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={actionLoading}>
                  {actionLoading ? "Joining..." : "Join"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
