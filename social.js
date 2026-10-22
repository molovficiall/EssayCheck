document.querySelectorAll('[data-social-share]').forEach((link) => {
  const pageUrl = window.location.href.split('#')[0];
  const title = document.title;
  const shareUrl = new URL(link.dataset.socialShare);

  if (shareUrl.hostname === 'www.facebook.com') {
    shareUrl.searchParams.set('u', pageUrl);
  } else if (shareUrl.hostname === 'pinterest.com') {
    shareUrl.searchParams.set('url', pageUrl);
    shareUrl.searchParams.set('description', title);
  }

  link.href = shareUrl.toString();
});
