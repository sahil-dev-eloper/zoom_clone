import asyncio
import json
import websockets

async def test_mesh_signaling():
    meeting_id = "test_meeting_mesh_999"
    uri = f"ws://localhost:8000/ws/meetings/{meeting_id}"

    print("Connecting Peer 1...")
    async with websockets.connect(uri) as ws1:
        await ws1.send(json.dumps({"type": "join", "peerId": "peer_alice", "displayName": "Alice"}))
        msg1 = json.loads(await ws1.recv())
        assert msg1["type"] == "peers", f"Expected peers msg, got {msg1}"
        assert msg1["peerIds"] == []
        print("Peer 1 registered successfully, no existing peers.")

        print("Connecting Peer 2...")
        async with websockets.connect(uri) as ws2:
            await ws2.send(json.dumps({"type": "join", "peerId": "peer_bob", "displayName": "Bob"}))
            msg2 = json.loads(await ws2.recv())
            assert msg2["type"] == "peers"
            assert "peer_alice" in msg2["peerIds"], f"Expected peer_alice in peers, got {msg2['peerIds']}"
            print("Peer 2 registered successfully, found peer_alice.")

            # Peer 1 should receive peer-joined
            pj = json.loads(await ws1.recv())
            assert pj["type"] == "peer-joined"
            assert pj["peerId"] == "peer_bob"
            assert pj["displayName"] == "Bob"
            print("Peer 1 received peer-joined for Bob.")

            # Peer 2 sends offer to Peer 1
            offer_sdp = {"type": "offer", "sdp": "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n"}
            await ws2.send(json.dumps({
                "type": "offer",
                "peerId": "peer_bob",
                "targetPeerId": "peer_alice",
                "sdp": offer_sdp
            }))

            # Peer 1 receives offer
            offer_rcv = json.loads(await ws1.recv())
            assert offer_rcv["type"] == "offer"
            assert offer_rcv["peerId"] == "peer_bob"
            assert offer_rcv["targetPeerId"] == "peer_alice"
            assert "m=video" in offer_rcv["sdp"]["sdp"]
            print("Peer 1 received offer from Bob.")

            # Peer 1 sends answer to Peer 2
            answer_sdp = {"type": "answer", "sdp": "v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n"}
            await ws1.send(json.dumps({
                "type": "answer",
                "peerId": "peer_alice",
                "targetPeerId": "peer_bob",
                "sdp": answer_sdp
            }))

            # Peer 2 receives answer
            ans_rcv = json.loads(await ws2.recv())
            assert ans_rcv["type"] == "answer"
            assert ans_rcv["peerId"] == "peer_alice"
            assert ans_rcv["targetPeerId"] == "peer_bob"
            print("Peer 2 received answer from Alice.")

            # Exchange ICE candidate
            cand = {"candidate": "candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host", "sdpMid": "0", "sdpMLineIndex": 0}
            await ws2.send(json.dumps({
                "type": "candidate",
                "peerId": "peer_bob",
                "targetPeerId": "peer_alice",
                "candidate": cand
            }))
            cand_rcv = json.loads(await ws1.recv())
            assert cand_rcv["type"] == "candidate"
            assert cand_rcv["candidate"]["candidate"] == cand["candidate"]
            print("Peer 1 received ICE candidate from Bob.")

            # Exchange media state
            await ws1.send(json.dumps({
                "type": "media-state",
                "peerId": "peer_alice",
                "video": True,
                "audio": True
            }))
            media_rcv = json.loads(await ws2.recv())
            assert media_rcv["type"] == "media-state"
            assert media_rcv["video"] is True
            print("Peer 2 received media-state from Alice.")

    print("ALL MULTI-PEER MESH SIGNALING TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(test_mesh_signaling())
