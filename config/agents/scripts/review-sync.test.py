import importlib.machinery
import importlib.util
import unittest
from pathlib import Path

path = Path(__file__).resolve().parents[3] / 'scripts' / 'review-sync'
loader = importlib.machinery.SourceFileLoader('review_sync', str(path))
spec = importlib.util.spec_from_loader('review_sync', loader)
rs = importlib.util.module_from_spec(spec)
loader.exec_module(rs)


class ReviewSync(unittest.TestCase):
    def test_cited_numbers_only_for_the_repo(self):
        text = 'a github.com/x/y/pull/12 b github.com/x/other/pull/99 github.com/x/y/pull/7'
        self.assertEqual(rs.cited_pr_numbers(text, 'x/y'), {12, 7})

    def test_unseen_skips_cited(self):
        prs = [{'number': 1}, {'number': 2}]
        self.assertEqual(rs.unseen(prs, {1}), [{'number': 2}])

    def test_only_reviewer_comments_and_nonempty_reviews(self):
        inline = [{'user': {'login': 'a'}, 'path': 'f', 'html_url': 'u1', 'body': 'x'},
                  {'user': {'login': 'b'}, 'path': 'f', 'html_url': 'u2', 'body': 'y'}]
        reviews = [{'user': {'login': 'a'}, 'state': 'APPROVED', 'html_url': 'u3', 'body': ''},
                   {'user': {'login': 'a'}, 'state': 'COMMENTED', 'html_url': 'u4', 'body': 'z'}]
        rows = rs.reviewer_comments(inline, reviews, 'a')
        self.assertEqual([r[1] for r in rows], ['u1', 'u4'])


if __name__ == '__main__':
    unittest.main()
