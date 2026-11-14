"""Offline safety checks; no credentials or network required."""
import contextlib
import io
import unittest
from unittest.mock import patch

import prepare


class SafetyTests(unittest.TestCase):
    def test_wrong_account_stops_before_inventory(self):
        with patch.object(prepare, "get_json", return_value={"result": {"id": "wrong"}}) as get:
            with self.assertRaises(prepare.PreflightError):
                prepare.check("test-only-placeholder")
            self.assertEqual(get.call_count, 1)

    def test_collision_on_later_page_stops(self):
        def get(path, token):
            if path == "/accounts/" + prepare.ACCOUNT_ID:
                return {"result": {"id": prepare.ACCOUNT_ID}}
            if "/pages/projects?" in path:
                if "page=2&" in path or path.endswith("page=2"):
                    return {"result": [{"name": "rotapark-fcm-test"}], "result_info": {"total_pages": 2}}
                return {"result": [{"name": "other"}], "result_info": {"total_pages": 2}}
            return {"result": []}
        with patch.object(prepare, "get_json", side_effect=get):
            with self.assertRaisesRegex(prepare.PreflightError, "İsim çakışması"):
                prepare.check("test-only-placeholder")

    def test_transport_is_get_and_does_not_log_credentials(self):
        response = io.StringIO('{"success": true, "result": []}')
        class Opener:
            def open(self, request, timeout):
                self_test.assertEqual(request.get_method(), "GET")
                self_test.assertEqual(request.host, "api.cloudflare.com")
                return response
        self_test = self
        output = io.StringIO()
        with patch.object(prepare.urllib.request, "build_opener", return_value=Opener()):
            with contextlib.redirect_stdout(output):
                prepare.get_json("/accounts/" + prepare.ACCOUNT_ID, "test-only-placeholder")
        self.assertEqual(output.getvalue(), "")

    def test_plan_has_exactly_six_targets(self):
        plan = prepare.creation_plan()
        self.assertEqual(len(plan), 6)
        self.assertEqual(sum(item["method"] == "PUT" for item in plan), 1)
        self.assertTrue(all(item["name"].startswith("rotapark-fcm-test") for item in plan))
        self.assertEqual(plan[1]["multipart"]["metadata"]["bindings"], [])

    def test_redirect_is_not_followed(self):
        self.assertIsNone(prepare.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.com"))


if __name__ == "__main__":
    unittest.main()
