#!/usr/bin/env perl
use strict;
use warnings;

my @queue = (
  "/npm/\@tiptap/core\@2.2.4/+esm",
  "/npm/\@tiptap/starter-kit\@2.2.4/+esm",
  "/npm/\@tiptap/extension-placeholder\@2.2.4/+esm",
  "/npm/tiptap-markdown\@0.8.10/+esm",
);
my %seen;
my $root = "static/vendor/tiptap";

sub local_path {
  my ($p) = @_;
  $p =~ s{/\+esm$}{.mjs};
  return "$root$p";
}

while (@queue) {
  my $path = shift @queue;
  next if $seen{$path}++;
  my $url = "https://cdn.jsdelivr.net$path";
  my $content = `curl -s "$url"`;
  if (!length($content)) {
    die "Failed to fetch $url\n";
  }

  my @refs = ($content =~ m{["'](/npm/[^"']*?/\+esm)["']}g);
  for my $ref (@refs) {
    push @queue, $ref unless $seen{$ref};
  }

  $content =~ s{["'](/npm/[^"']*?/\+esm)["']}{
    my $orig = $1;
    my $local = $orig;
    $local =~ s{/\+esm$}{.mjs};
    "\"/vendor/tiptap$local\""
  }ge;

  my $outfile = local_path($path);
  (my $dir = $outfile) =~ s{/[^/]+$}{};
  system("mkdir", "-p", $dir) == 0 or die "mkdir failed for $dir\n";
  open(my $fh, ">", $outfile) or die "Cannot write $outfile: $!";
  print $fh $content;
  close $fh;
  print "Vendored $path -> $outfile (" . length($content) . " bytes)\n";
}

print "\nDone. " . scalar(keys %seen) . " files vendored.\n";
